/**
 * Orchestrator - Agent principal Claude
 *
 * Coordonne l'ensemble du système : analyse les requêtes utilisateur,
 * délègue aux sub-agents spécialisés, exécute les tools, gère la boucle
 * d'interaction avec l'API Claude.
 *
 * Principe "Discover, Don't Assume" :
 * - Toujours découvrir les capacités avant d'agir
 * - Toujours inspecter les schémas avant de créer
 * - Jamais supposer qu'un bloc ou attribut existe
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

// Import des clients
import { WordPressAPI } from '../clients/wordpress-api.js';
import { AnthropicClient } from '../clients/anthropic-client.js';
import { RedisCache } from '../cache/redis-cache.js';
// import { GutenbergController } from '../clients/gutenberg-controller.js';

// Import du gestionnaire de conversations
import { getConversationManager } from '../services/conversation-manager.js';

// Import des sub-agents  (TODO pour plus tard)
// import { SEOAgent } from './sub-agents/seo-agent.js';
// import { CopywritingAgent } from './sub-agents/copywriting-agent.js';
// import { DesignAgent } from './sub-agents/design-agent.js';
// import { TechnicalAgent } from './sub-agents/technical-agent.js';

// Import des tools
import { getWordPressTools } from './tools/wordpress-tools.js';
import { getGutenbergTools } from './tools/gutenberg-tools.js';
import { getFSETools } from './tools/fse-tools.js';

/**
 * Keywords pour détecter les requêtes nécessitant un plan
 */
const PLAN_MODE_KEYWORDS = [
	'créer',
	'faire',
	'mettre en place',
	'développer',
	'construire',
	'générer',
	'configurer',
	'implémenter',
	'installer',
	'setup',
	'create',
	'build',
	'develop',
	'generate',
	'implement',
	'set up',
	'make',
];

/**
 * System prompt pour l'orchestrateur (extrait des specs lignes 1065-1121)
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `Tu es un agent expert en création de sites WordPress avec Gutenberg.

🎯 RÈGLE #0 - LA PLUS IMPORTANTE:
❗️ NE DÉCRIS PAS CE QUE TU VAS FAIRE, AGIS DIRECTEMENT
   - N'explique PAS ton plan step by step
   - N'écris PAS "Je vais créer...", "Maintenant je vais...", "Commençons par..."
   - APPELLE LES OUTILS IMMÉDIATEMENT sans explication
   - Ta réponse finale peut être concise (1-2 phrases) pour confirmer ce qui a été fait
   - Garde tes explications pour les erreurs ou clarifications nécessaires

⚠️ RÈGLES CRITIQUES - TOUJOURS RESPECTER:

1. DÉCOUVERTE AVANT ACTION (PROGRESSIVE DISCLOSURE)
   - TOUJOURS appeler 'discover_available_blocks' au début (retourne un résumé léger)
   - TOUJOURS appeler 'get_theme_design_system' pour connaître couleurs/polices
   - N'appelle 'get_patterns' QUE si tu as besoin de patterns (retourne liste résumée)
   - Utilise 'get_pattern_details' UNIQUEMENT pour récupérer le contenu d'UN pattern choisi
   - JAMAIS supposer qu'un bloc existe

   ⚠️ ÉCONOMIE DE TOKENS: Ne charge que ce dont tu as BESOIN, pas tout d'un coup!

2. INSPECTION AVANT CRÉATION
   - TOUJOURS appeler 'inspect_block_schema' avant de créer un bloc
   - TOUJOURS vérifier les attributs disponibles
   - JAMAIS utiliser un attribut qui n'existe pas dans le schema
   - JAMAIS inventer des valeurs, utiliser UNIQUEMENT celles dans 'possible_values'

3. BLOCS COMPLEXES (50+ attributs)
   - TOUJOURS chercher un template d'abord avec 'search_block_templates'
   - Si template existe, utiliser 'use_block_template' avec overrides
   - Si pas de template, utiliser progressive disclosure :
     * Charger "essential" d'abord
     * Ajouter groupes supplémentaires UNIQUEMENT si nécessaire
   - JAMAIS charger tous les attributs d'un coup

4. MODIFICATION DE CONTENU EN TEMPS RÉEL (PRÉCISION CHIRURGICALE!)

   🎯 MÉTHODE RECOMMANDÉE - IDs PERSISTANTS (claudeAgentId):

   1️⃣ get_blocks_structure()
      → Obtient TOUS les blocs avec DEUX identifiants:
        • claudeAgentId: ID PERSISTANT (survit aux rechargements de page) ⭐ RECOMMANDÉ
        • clientId: ID volatile (change à chaque reload) ⚠️ ÉVITER

   2️⃣ update_block_by_agent_id({ agentId: "...", attributes: {...} })
      → Modifie UNIQUEMENT ce bloc en TEMPS RÉEL dans Gutenberg
      → Utilise l'ID PERSISTANT (claudeAgentId)
      → ✅ Fonctionne même si l'utilisateur rafraîchit la page!

   ⚠️ RÈGLES CRITIQUES:
   - TOUJOURS PRÉFÉRER update_block_by_agent_id (IDs persistants)
   - TOUJOURS appeler get_blocks_structure AVANT de modifier
   - Pour modifier 5 blocs = 5 appels à update_block_by_agent_id
   - Ne JAMAIS essayer de modifier plusieurs blocs en un seul appel

   📋 EXEMPLE ULTRA SIMPLE:

   get_blocks_structure() → [
     {
       "claudeAgentId": "550e8400-e29b-41d4-a716-446655440000",  ← ID PERSISTANT ⭐
       "clientId": "abc123",  ← volatile (change au reload)
       "name": "core/heading",
       "attributes": { "content": "🤖 Titre avec emoji" }
     },
     {
       "claudeAgentId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
       "clientId": "def456",
       "name": "core/paragraph",
       "attributes": { "content": "Texte..." }
     }
   ]

   // Supprimer l'emoji du premier heading (avec ID persistant):
   update_block_by_agent_id({
     agentId: "550e8400-e29b-41d4-a716-446655440000",
     attributes: {content: "Titre sans emoji"}
   })
   ✅ Tous les autres blocs restent intacts automatiquement!

   // Modifier aussi le paragraph:
   update_block_by_agent_id({
     agentId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
     attributes: {content: "Nouveau texte"}
   })
   ✅ Le heading reste inchangé!

   🎯 OUTILS DISPONIBLES (par ordre de préférence):
   1. update_block_by_agent_id (⭐ RECOMMANDÉ - IDs persistants)
   2. remove_block_by_agent_id (⭐ RECOMMANDÉ)
   3. replace_block_by_agent_id (⭐ RECOMMANDÉ)
   4. update_block_by_clientid (⚠️ Fallback si agentId indisponible)
   5. remove_block_realtime (⚠️ Fallback)
   6. replace_block_realtime (⚠️ Fallback)

   ❌ INTERDICTIONS ABSOLUES:
   - JAMAIS utiliser update_post pour modifier du contenu (trop lourd)
   - JAMAIS générer du HTML manuellement
   - JAMAIS modifier un bloc sans avoir appelé get_blocks_structure d'abord

   ✅ L'utilisateur voit TOUS les changements en temps réel dans Gutenberg

5. INSERTION DE SECTIONS COMPLÈTES AVEC PATTERNS

   🎯 RÈGLE IMPORTANTE: Pour insérer ou remplacer des sections complètes (hero, features, pricing, etc.),
      TOUJOURS utiliser les PATTERNS au lieu de créer des blocs manuellement!

   🔧 DEUX OUTILS DISPONIBLES:

   A) insert_pattern - INSÉRER un nouveau pattern
      WORKFLOW:
      1️⃣ get_patterns() → Voir tous les patterns disponibles
      2️⃣ insert_pattern({ pattern_slug: "...", index: 0 }) → Insérer le pattern

      📋 EXEMPLE - Ajouter une hero en début de page:
      get_patterns() → [{ slug: "hero-section", title: "Hero Section", ... }]
      insert_pattern({ pattern_slug: "hero-section", index: 0 })
      ✅ Section complète insérée instantanément!

   B) swap_pattern - REMPLACER un bloc existant par un pattern
      WORKFLOW:
      1️⃣ get_blocks_structure() → Obtenir le claudeAgentId du bloc à remplacer
      2️⃣ get_patterns() → Choisir le pattern de remplacement
      3️⃣ swap_pattern({ agentId: "...", pattern_slug: "..." }) → Faire le swap

      📋 EXEMPLE - Remplacer un paragraphe simple par une hero complète:
      get_blocks_structure() → [{ claudeAgentId: "550e8400-...", name: "core/paragraph" }]
      swap_pattern({ agentId: "550e8400-...", pattern_slug: "hero-section" })
      ✅ Bloc remplacé par une section complète!

   ⚠️ RÈGLES CRITIQUES:
   - TOUJOURS préférer insert_pattern/swap_pattern pour les sections complètes
   - N'utilise JAMAIS insert_block_realtime pour insérer des patterns
   - Les patterns sont déjà validés et optimisés
   - swap_pattern utilise les claudeAgentId (IDs persistants)

6. RESPECT DU DESIGN SYSTEM
   - TOUJOURS utiliser les couleurs du thème (jamais de hex custom)
   - TOUJOURS utiliser les polices du thème
   - TOUJOURS utiliser les tailles prédéfinies

7. VALIDATION
   - Si erreur de validation, lire attentivement le message
   - Corriger UNIQUEMENT les attributs en erreur
   - Réessayer (max 3 fois)

8. DÉLÉGATION AUX SUB-AGENTS
   - SEO Agent : Optimisation structure, mots-clés, meta
   - Copywriting Agent : Contenu persuasif, CTAs
   - Design Agent : Layout, couleurs, UX
   - Technical Agent : Validation, performance

WORKFLOW STANDARD:
1. Découverte globale (blocs + design system) - SANS EXPLICATION
2. Création des blocs/pages directement - SANS DÉCRIRE TON PLAN
3. Rapport final concis (1-2 phrases)

INTERDICTIONS ABSOLUES:
❌ JAMAIS générer du HTML Gutenberg manuellement
❌ JAMAIS utiliser un attribut non documenté
❌ JAMAIS charger un schema complet de 100+ attributs
❌ JAMAIS utiliser des couleurs/polices custom (sauf si autorisé)
❌ JAMAIS écrire de longues explications - AGIS DIRECTEMENT`;;

/**
 * Classe Orchestrator
 */
export class Orchestrator {
	/**
	 * Constructeur
	 *
	 * @param {Object} config - Configuration complète
	 * @param {Object} config.wordpress - Config WordPress
	 * @param {Object} config.anthropic - Config Anthropic
	 * @param {Object} config.redis - Config Redis
	 * @param {Object} config.cache - Config cache
	 * @param {Object} config.playwright - Config Playwright
	 */
	constructor(config) {
		this.config = config;
		this.anthropicClient = null;
		this.wordpressAPI = null;
		this.gutenbergController = null;
		this.subAgents = {};
		this.tools = [];
		// Note: conversationHistory is NOT stored here to avoid sharing between concurrent requests
	}

	/**
	 * Initialise l'orchestrateur et tous ses composants
	 *
	 * @returns {Promise<void>}
	 */
	async initialize() {
		try {
			logger.info('Initializing Orchestrator...');

			// Initialiser le client Anthropic
			this.anthropicClient = new AnthropicClient(this.config.anthropic.apiKey);
			logger.info('Anthropic client initialized');

			// Initialiser le cache Redis (optionnel)
			let cache = null;
			if (this.config.redis && this.config.redis.enabled) {
				cache = new RedisCache(this.config.redis);
				await cache.initialize();
				logger.info('Redis cache initialized');
			}

			// Initialiser WordPress API
			this.wordpressAPI = new WordPressAPI(this.config.wordpress, cache);
			await this.wordpressAPI.initialize();
			logger.info('WordPress API initialized');

			// TODO: Initialiser Gutenberg Controller (Phase 3 - Gutenberg)
			// this.gutenbergController = new GutenbergController(this.config.playwright);
			// await this.gutenbergController.initialize();

			// TODO: Initialiser les sub-agents (Phase 4)
			// this.subAgents.seo = new SEOAgent(this.anthropicClient, this.config);
			// this.subAgents.copywriting = new CopywritingAgent(this.anthropicClient, this.config);
			// this.subAgents.design = new DesignAgent(this.anthropicClient, this.config);
			// this.subAgents.technical = new TechnicalAgent(this.anthropicClient, this.config);

			// Charger tous les tools disponibles
			this.tools = [
				...getWordPressTools(this.wordpressAPI),
				...getGutenbergTools(), // Real-time Gutenberg tools via PostMessage
				...getFSETools(this.wordpressAPI),
			];

			logger.info(`Orchestrator initialized successfully with ${this.tools.length} tools`);
		} catch (error) {
			logger.error('Failed to initialize Orchestrator', { error: error.message });
			throw new AppError('Orchestrator initialization failed', 500);
		}
	}

	/**
	 * Détecte si une requête nécessite un plan
	 *
	 * @param {string} userMessage - Message de l'utilisateur
	 * @returns {boolean} True si un plan est nécessaire
	 */
	shouldCreatePlan(userMessage) {
		const lowerMessage = userMessage.toLowerCase();

		// Vérifier si la requête contient des mots-clés de plan
		const hasPlanKeyword = PLAN_MODE_KEYWORDS.some(keyword =>
			lowerMessage.includes(keyword)
		);

		// Vérifier si la requête est complexe (plusieurs étapes)
		const hasMultipleSteps =
			lowerMessage.includes(' et ') ||
			lowerMessage.includes(' puis ') ||
			lowerMessage.includes(' ensuite ') ||
			lowerMessage.includes(', ') ||
			lowerMessage.includes(' and ') ||
			lowerMessage.includes(' then ');

		// Vérifier si la requête contient une liste (1., 2., -, etc.)
		const hasList = /[0-9]\.|[-*]/.test(userMessage);

		return hasPlanKeyword || hasMultipleSteps || hasList;
	}

	/**
	 * Génère un plan d'action pour une requête complexe
	 *
	 * @param {string} userMessage - Message de l'utilisateur
	 * @param {Object} context - Contexte WordPress
	 * @returns {Promise<Object>} Plan généré
	 */
	async generatePlan(userMessage, context = {}) {
		logger.info('Generating plan for user request');

		// Créer un message système pour la génération de plan
		const planSystemPrompt = `Tu es un expert en planification de tâches WordPress.
Génère un plan d'action structuré pour la requête utilisateur.

IMPORTANT:
- Décompose la tâche en étapes claires et actionnables
- Chaque étape doit être une action concrète
- Utilise le format JSON suivant:
{
  "tasks": [
    { "id": "1", "label": "Description de la tâche 1", "status": "pending" },
    { "id": "2", "label": "Description de la tâche 2", "status": "pending" }
  ]
}

RÈGLES:
- Maximum 10 tâches
- Chaque label doit être court et clair (max 100 caractères)
- Status doit toujours être "pending" initialement`;

		const response = await this.anthropicClient.sendMessage({
			system: planSystemPrompt,
			messages: [
				{
					role: 'user',
					content: `Contexte WordPress: ${JSON.stringify(context, null, 2)}\n\nRequête utilisateur: ${userMessage}\n\nGénère le plan d'action au format JSON.`,
				},
			],
			max_tokens: 2048,
		});

		const responseText = this.anthropicClient.extractText(response);

		// Parser la réponse JSON
		try {
			// Extraire le JSON de la réponse (peut être entouré de ```json)
			const jsonMatch = responseText.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const plan = JSON.parse(jsonMatch[0]);
				return plan;
			}
		} catch (error) {
			logger.error('Failed to parse plan JSON', { error: error.message });
		}

		// Fallback: créer un plan simple
		return {
			tasks: [
				{
					id: '1',
					label: userMessage.substring(0, 100),
					status: 'pending',
				},
			],
		};
	}

	/**
	 * Traite une requête utilisateur
	 *
	 * Lance la boucle d'interaction avec Claude : message → tool calls → results → repeat
	 *
	 * @param {string} userMessage - Message de l'utilisateur
	 * @param {Object} options - Options (conversation context, etc.)
	 * @returns {Promise<Object>} Résultat final
	 */
	async processRequest(userMessage, options = {}) {
		try {
			logger.info('Processing user request', { message: userMessage.substring(0, 100) });

			// Create a LOCAL conversation history for THIS request only (isolation)
			const conversationHistory = [{
				role: 'user',
				content: userMessage,
			}];

			// Boucle d'interaction avec Claude
			let continueLoop = true;
			let finalResponse = null;
			let iterations = 0;
			const maxIterations = options.maxIterations || 20;
			const totalUsage = {
				input_tokens: 0,
				output_tokens: 0,
			};

			// Préparer les tools au format Anthropic (sans les handlers)
			const toolsForAnthropic = this.tools.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: t.input_schema,
			}));

			while (continueLoop && iterations < maxIterations) {
				iterations++;
				logger.info(`Orchestrator iteration ${iterations}/${maxIterations}`);

				// Envoyer message + tools à Claude
				const response = await this.anthropicClient.sendMessage({
					system: ORCHESTRATOR_SYSTEM_PROMPT,
					messages: conversationHistory,
					tools: toolsForAnthropic,
					max_tokens: options.maxTokens || 8192,
					extended_thinking: options.extended_thinking || false,
				});

				// Accumuler les tokens utilisés
				totalUsage.input_tokens += response.usage.input_tokens;
				totalUsage.output_tokens += response.usage.output_tokens;

				logger.info(`Claude response received`, {
					stop_reason: response.stop_reason,
					usage: response.usage,
				});

				// Traiter la réponse
				if (response.stop_reason === 'tool_use') {
					// Claude demande d'exécuter des tools
					const toolCalls = this.anthropicClient.extractToolCalls(response);
					logger.info(`Claude requested ${toolCalls.length} tool call(s)`);

					// Ajouter la réponse de Claude à l'historique
					conversationHistory.push({
						role: 'assistant',
						content: response.content,
					});

					// Exécuter tous les tool calls
					const toolResults = [];

					for (const toolCall of toolCalls) {
						try {
							const result = await this.executeTool(toolCall.name, toolCall.input);

							toolResults.push({
								type: 'tool_result',
								tool_use_id: toolCall.id,
								content: JSON.stringify(result),
							});
						} catch (error) {
							// En cas d'erreur, renvoyer l'erreur à Claude
							toolResults.push({
								type: 'tool_result',
								tool_use_id: toolCall.id,
								content: JSON.stringify({
									error: true,
									message: error.message,
								}),
								is_error: true,
							});
						}
					}

					// Renvoyer les résultats à Claude
					conversationHistory.push({
						role: 'user',
						content: toolResults,
					});
				} else if (response.stop_reason === 'end_turn') {
					// Réponse finale
					finalResponse = response;
					continueLoop = false;
				} else {
					// Autre raison d'arrêt (max_tokens, etc.)
					logger.warn(`Unexpected stop reason: ${response.stop_reason}`);
					finalResponse = response;
					continueLoop = false;
				}
			}

			if (iterations >= maxIterations) {
				logger.warn(`Max iterations (${maxIterations}) reached`);
			}

			// Extraire le texte de la réponse finale
			const responseText = finalResponse
				? this.anthropicClient.extractText(finalResponse)
				: 'No response generated';

			return {
				success: true,
				response: responseText,
				iterations,
				usage: totalUsage,
			};
		} catch (error) {
			logger.error('Error processing request in Orchestrator', { error: error.message });
			throw error;
		}
	}

	/**
	 * Version streaming de processRequest avec callbacks pour événements en temps réel
	 *
	 * @param {string} userMessage - Message de l'utilisateur
	 * @param {Object} options - Options avec callbacks
	 * @param {Object} options.wordpress_context - Contexte WordPress actuel (page en cours d'édition)
	 * @param {Function} options.onIterationStart - Callback appelé au début de chaque iteration
	 * @param {Function} options.onToolCall - Callback appelé avant chaque appel de tool
	 * @param {Function} options.onToolResult - Callback appelé après chaque résultat de tool
	 * @param {Function} options.onPlanGenerated - Callback appelé quand un plan est généré (attend validation)
	 * @param {Function} options.onPlanTaskUpdate - Callback appelé quand une tâche du plan change de statut
	 * @param {Function} options.onFinalResponse - Callback appelé avec la réponse finale
	 * @param {Function} options.onError - Callback appelé en cas d'erreur
	 * @param {boolean} options.skip_plan_mode - Force le skip du plan mode
	 * @returns {Promise<Object>} Résultat final
	 */
	async processRequestStream(userMessage, options = {}) {
		try {
			const {
				conversation_id,
				wordpress_context,
				enabled_tools,
				onIterationStart,
				onToolCall,
				onToolResult,
				onPlanGenerated,
				onPlanTaskUpdate,
				onFinalResponse,
				onError,
				skip_plan_mode = false,
				...otherOptions
			} = options;

			logger.info('Processing user request (streaming)', {
				message: userMessage.substring(0, 100),
				has_context: !!wordpress_context,
				conversation_id: conversation_id || 'new',
				context: wordpress_context
			});

			// === DÉTECTION DU PLAN MODE ===
			if (!skip_plan_mode && this.shouldCreatePlan(userMessage)) {
				logger.info('Plan mode detected, generating plan');

				// Générer le plan
				const plan = await this.generatePlan(userMessage, wordpress_context);

				// Envoyer le plan au frontend pour validation
				if (onPlanGenerated) {
					// Le callback onPlanGenerated doit retourner une Promise qui se résout quand l'utilisateur valide/rejette
					// Le frontend doit implémenter cette logique
					const planApproved = await onPlanGenerated(plan);

					if (!planApproved) {
						logger.info('Plan rejected by user');
						return {
							success: false,
							response: 'Plan rejected by user',
							plan_rejected: true,
						};
					}

					logger.info('Plan approved by user, proceeding with execution');

					// Continuer avec l'exécution du plan
					// Le reste de la fonction sera exécuté normalement
					// Les callbacks onPlanTaskUpdate seront appelés pour chaque tâche
				}
			}

			// === GESTION DE LA PERSISTANCE DE CONVERSATION ===
			const conversationManager = getConversationManager();
			let activeConversationId = conversation_id;

			// Si pas de conversation_id fourni, créer une nouvelle conversation
			if (!activeConversationId) {
				activeConversationId = conversationManager.createConversation({
					wordpress_context: wordpress_context,
					created_by: 'user', // TODO: remplacer par vrai user_id quand auth est implémentée
				});
				logger.info('New conversation created', { conversation_id: activeConversationId });
			}

			// Charger l'historique existant (ou tableau vide si nouvelle conversation)
			const conversationHistory = conversationManager.getHistory(activeConversationId);

			logger.info('Conversation history loaded', {
				conversation_id: activeConversationId,
				previous_messages: conversationHistory.length
			});

			// IMPORTANT: Si un contexte WordPress existe, récupérer et injecter un résumé complet
			// (uniquement si c'est une nouvelle conversation ou si le contexte a changé)
			if (wordpress_context && wordpress_context.current_post_id) {
				// Vérifier si on a déjà injecté le contexte pour cette page
				const hasContextForThisPage = conversationHistory.some(msg =>
					msg.role === 'user' &&
					msg.content.includes(`ID: ${wordpress_context.current_post_id}`)
				);

				if (!hasContextForThisPage) {
					// Récupérer le contexte enrichi depuis WordPress API
					let fullContext = null;
					try {
						fullContext = await this.wordpressAPI.getPageContext(wordpress_context.current_post_id);
						logger.info('Full page context retrieved from WordPress API', {
							post_id: wordpress_context.current_post_id,
							estimated_tokens: fullContext.estimated_tokens,
						});
					} catch (error) {
						logger.warn('Failed to retrieve full page context, using basic context', {
							post_id: wordpress_context.current_post_id,
							error: error.message,
						});
					}

					// Construire le message de contexte
					let contextMessage = `CURRENT WORDPRESS CONTEXT:\n`;

					if (fullContext) {
						// Utiliser le contexte enrichi
						contextMessage += `You are currently editing the ${fullContext.post_type} "${fullContext.post_title}" (ID: ${fullContext.post_id}, status: ${fullContext.post_status}).\n\n`;
						contextMessage += `CONTENT STRUCTURE:\n`;
						contextMessage += `- Total blocks: ${fullContext.blocks_count}\n`;

						if (fullContext.blocks_by_type && Object.keys(fullContext.blocks_by_type).length > 0) {
							contextMessage += `- Block types used:\n`;
							for (const [blockType, count] of Object.entries(fullContext.blocks_by_type)) {
								contextMessage += `  * ${blockType}: ${count}\n`;
							}
						}

						if (fullContext.categories && fullContext.categories.length > 0) {
							contextMessage += `- Categories: ${fullContext.categories.join(', ')}\n`;
						}

						if (fullContext.tags && fullContext.tags.length > 0) {
							contextMessage += `- Tags: ${fullContext.tags.join(', ')}\n`;
						}

						if (fullContext.featured_image) {
							contextMessage += `- Has featured image: yes\n`;
						}

						if (fullContext.excerpt) {
							contextMessage += `\nEXCERPT: ${fullContext.excerpt}\n`;
						}
					} else {
						// Fallback: utiliser le contexte basique du frontend
						contextMessage += `You are currently editing the ${wordpress_context.post_type || 'page'} "${wordpress_context.post_title}" (ID: ${wordpress_context.current_post_id}, status: ${wordpress_context.post_status || 'unknown'}).\n`;
						contextMessage += `This page contains ${wordpress_context.blocks_count || 0} block(s).\n`;
					}

					contextMessage += `\n⚠️ IMPORTANT: The user wants to EDIT THIS EXISTING PAGE, do NOT create a new page unless explicitly requested.\n`;
					contextMessage += `If the user asks to add content, use the tools to modify this page (ID: ${wordpress_context.current_post_id}).`;

					// Ajouter le contexte de block sélectionné s'il existe
					if (wordpress_context.selected_block) {
						contextMessage += `\n\nSELECTED BLOCK:\n`;
						contextMessage += `The user has selected the block "${wordpress_context.selected_block.name}" with clientId "${wordpress_context.selected_block.clientId}".\n`;
						contextMessage += `⚠️ CRITICAL: When the user asks to modify or edit, they likely want to edit THIS SPECIFIC BLOCK ONLY.\n`;
						contextMessage += `⚠️ WORKFLOW: 1) Call get_blocks_structure() to get all clientIds, 2) Use update_block_by_clientid with the correct clientId\n`;
						contextMessage += `⚠️ DO NOT use update_post as it will replace the entire page content!\n`;
						contextMessage += `Block attributes: ${JSON.stringify(wordpress_context.selected_block.attributes, null, 2)}\n`;

						if (wordpress_context.selected_block.innerBlocks > 0) {
							contextMessage += `This block contains ${wordpress_context.selected_block.innerBlocks} inner block(s).\n`;
						}
					}

					conversationHistory.push({
						role: 'user',
						content: contextMessage,
					});

					logger.info('WordPress context injected into conversation', {
						post_id: wordpress_context.current_post_id,
						has_full_context: !!fullContext,
						has_selected_block: !!wordpress_context.selected_block,
					});
				}
			}

			// Ajouter le message utilisateur actuel à l'historique
			conversationHistory.push({
				role: 'user',
				content: userMessage,
			});

			let continueLoop = true;
			let finalResponse = null;
			let iterations = 0;
			const maxIterations = otherOptions.maxIterations || 20;
			const totalUsage = { input_tokens: 0, output_tokens: 0 };

			// Filter tools based on enabled_tools array if provided
			let availableTools = this.tools;
			if (enabled_tools && enabled_tools.length > 0) {
				availableTools = this.tools.filter(tool => enabled_tools.includes(tool.name));
				logger.info('Tools filtered', {
					total_tools: this.tools.length,
					enabled_tools: availableTools.length,
					tool_names: availableTools.map(t => t.name)
				});
			}

			const toolsForAnthropic = availableTools.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: t.input_schema,
			}));

			while (continueLoop && iterations < maxIterations) {
				iterations++;

				// Emit iteration start event
				if (onIterationStart) {
					onIterationStart(iterations, maxIterations);
				}

				logger.info(`Orchestrator iteration ${iterations}/${maxIterations}`);

				const response = await this.anthropicClient.sendMessage({
					system: ORCHESTRATOR_SYSTEM_PROMPT,
					messages: conversationHistory,
					tools: toolsForAnthropic,
					max_tokens: otherOptions.maxTokens || 8192,
					extended_thinking: otherOptions.extended_thinking || false,
				});

				totalUsage.input_tokens += response.usage.input_tokens;
				totalUsage.output_tokens += response.usage.output_tokens;

				if (response.stop_reason === 'tool_use') {
					const toolCalls = this.anthropicClient.extractToolCalls(response);

					conversationHistory.push({
						role: 'assistant',
						content: response.content,
					});

					const toolResults = [];

					for (const toolCall of toolCalls) {
						// Emit tool call event
						if (onToolCall) {
							onToolCall(toolCall.name, toolCall.input);
						}

						try {
							const result = await this.executeTool(toolCall.name, toolCall.input, onToolResult);

							// Emit tool success event
							// Note: Pour les commandes Gutenberg avec _awaitResult, onToolResult a déjà été
							// appelé dans executeTool. Mais pour les commandes sans _awaitResult (update_block, etc.),
							// on doit l'appeler ici.
							if (onToolResult) {
								// Si c'est une commande Gutenberg qui a DÉJÀ été streamée (avec _awaitResult),
								// ne pas la streamer à nouveau
								const alreadyStreamed = result._command === 'gutenberg_action' && result.structure;
								if (!alreadyStreamed) {
									onToolResult(toolCall.name, true, result);
								}
							}

							toolResults.push({
								type: 'tool_result',
								tool_use_id: toolCall.id,
								content: JSON.stringify(result),
							});
						} catch (error) {
							// Emit tool error event
							if (onToolResult) {
								onToolResult(toolCall.name, false, { message: error.message });
							}

							toolResults.push({
								type: 'tool_result',
								tool_use_id: toolCall.id,
								content: JSON.stringify({ error: true, message: error.message }),
								is_error: true,
							});
						}
					}

					conversationHistory.push({
						role: 'user',
						content: toolResults,
					});
				} else if (response.stop_reason === 'end_turn') {
					finalResponse = response;
					continueLoop = false;
				} else {
					finalResponse = response;
					continueLoop = false;
				}
			}

			const responseText = finalResponse
				? this.anthropicClient.extractText(finalResponse)
				: 'No response generated';

			// Emit final response event
			if (onFinalResponse) {
				onFinalResponse(responseText, totalUsage, activeConversationId);
			}

			// === SAUVEGARDER L'HISTORIQUE DANS LA CONVERSATION ===
			// L'historique a été muté pendant la boucle (push de messages)
			// Il faut maintenant le persister pour les prochaines requêtes
			try {
				conversationManager.clearHistory(activeConversationId);
				conversationManager.addMessages(activeConversationId, conversationHistory);

				logger.info('Conversation history saved', {
					conversation_id: activeConversationId,
					total_messages: conversationHistory.length,
					iterations
				});
			} catch (saveError) {
				logger.error('Failed to save conversation history', {
					conversation_id: activeConversationId,
					error: saveError.message
				});
				// Ne pas faire échouer la requête si la sauvegarde échoue
			}

			return {
				success: true,
				response: responseText,
				conversation_id: activeConversationId, // IMPORTANT: Retourner l'ID pour que le frontend puisse continuer la conversation
				iterations,
				usage: totalUsage,
			};
		} catch (error) {
			logger.error('Error in streaming request', { error: error.message });

			if (options.onError) {
				options.onError(error);
			}

			throw error;
		}
	}

	/**
	 * Délègue une tâche à un sub-agent spécialisé
	 *
	 * @param {string} subAgentType - Type de sub-agent (seo, copywriting, design, technical)
	 * @param {string} task - Tâche à accomplir
	 * @param {Object} context - Contexte additionnel
	 * @returns {Promise<Object>} Résultat du sub-agent
	 */
	async delegateToSubAgent(subAgentType, task, context = {}) {
		try {
			logger.info(`Delegating to ${subAgentType} sub-agent`, { task });

			// TODO: Implémenter la délégation
			// const subAgent = this.subAgents[subAgentType];
			// if (!subAgent) {
			//   throw new AppError(`Unknown sub-agent type: ${subAgentType}`, 400);
			// }
			//
			// return await subAgent.execute(task, context);

			return {
				success: true,
				message: `Sub-agent ${subAgentType} - Implementation pending`,
			};
		} catch (error) {
			logger.error(`Error delegating to ${subAgentType} sub-agent`, { error: error.message });
			throw error;
		}
	}

	/**
	 * Exécute un tool spécifique
	 *
	 * @param {string} toolName - Nom du tool
	 * @param {Object} toolInput - Paramètres du tool
	 * @returns {Promise<Object>} Résultat du tool
	 */
	async executeTool(toolName, toolInput, onToolResultCallback = null) {
		try {
			logger.info(`Executing tool: ${toolName}`, { input: toolInput });

			// Trouver le tool correspondant
			const tool = this.tools.find((t) => t.name === toolName);
			if (!tool) {
				throw new AppError(`Unknown tool: ${toolName}`, 400);
			}

			// Exécuter le handler du tool
			let result = await tool.handler(toolInput);

			// Si le résultat contient une promesse à attendre (_awaitResult)
			if (result && result._awaitResult) {
				logger.info(`Tool ${toolName} requires awaiting iframe response...`);

				// IMPORTANT: Si c'est une commande Gutenberg, l'envoyer IMMÉDIATEMENT au frontend
				if (result._command === 'gutenberg_action' && onToolResultCallback) {
					logger.info(`Sending Gutenberg command to frontend IMMEDIATELY`, {
						action: result.action,
						requestId: result.requestId,
					});
					// Envoyer la commande AVANT d'attendre la réponse
					onToolResultCallback(toolName, true, result);
				}

				// IMPORTANT: Sauvegarder _command avant de traiter la promesse
				const savedCommand = result._command;
				const savedAction = result.action;
				const savedRequestId = result.requestId;

				try {
					// Attendre la réponse de l'iframe (via HTTP callback)
					const iframeResponse = await result._awaitResult;

					logger.info(`Tool ${toolName} received iframe response`, {
						hasStructure: !!iframeResponse?.structure,
					});

					// Fusionner la réponse de l'iframe avec le résultat
					result = {
						...result,
						...iframeResponse,
					};

					// Supprimer le champ _awaitResult avant de retourner
					delete result._awaitResult;
				} catch (error) {
					logger.error(`Tool ${toolName} - iframe response timeout or error`, {
						error: error.message,
					});

					// En cas d'erreur/timeout, retourner une erreur descriptive MAIS garder _command
					return {
						_command: savedCommand,  // ← GARDER _command pour que le frontend puisse envoyer la commande
						action: savedAction,
						requestId: savedRequestId,
						success: false,
						error: `Iframe response timeout: ${error.message}`,
						message: `⚠️ Impossible de récupérer les données de l'iframe. L'opération a expiré après 10 secondes.`,
					};
				}
			}

			logger.info(`Tool ${toolName} executed successfully`);
			return result;
		} catch (error) {
			logger.error(`Error executing tool ${toolName}`, { error: error.message });
			throw error;
		}
	}

	/**
	 * Valide et réessaie un tool en cas d'erreur
	 *
	 * @param {string} toolName - Nom du tool
	 * @param {Object} toolInput - Paramètres du tool
	 * @param {number} maxRetries - Nombre max de tentatives
	 * @returns {Promise<Object>} Résultat du tool
	 */
	async validateAndRetry(toolName, toolInput, maxRetries = 3) {
		let lastError = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				logger.info(`Tool ${toolName} - Attempt ${attempt}/${maxRetries}`);
				return await this.executeTool(toolName, toolInput);
			} catch (error) {
				lastError = error;
				logger.warn(`Tool ${toolName} failed, attempt ${attempt}/${maxRetries}`, {
					error: error.message,
				});

				if (attempt === maxRetries) {
					break;
				}

				// Attendre avant de réessayer (exponential backoff)
				await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
			}
		}

		throw new AppError(
			`Tool ${toolName} failed after ${maxRetries} attempts: ${lastError.message}`,
			500
		);
	}

	/**
	 * Nettoie les ressources
	 *
	 * @returns {Promise<void>}
	 */
	async cleanup() {
		try {
			logger.info('Cleaning up Orchestrator resources...');

			// TODO: Fermer les connexions
			// if (this.gutenbergController) {
			//   await this.gutenbergController.close();
			// }

			logger.info('Orchestrator cleanup completed');
		} catch (error) {
			logger.error('Error during Orchestrator cleanup', { error: error.message });
		}
	}
}
