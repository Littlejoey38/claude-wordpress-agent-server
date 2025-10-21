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
// import { getGutenbergTools } from './tools/gutenberg-tools.js';
import { getFSETools } from './tools/fse-tools.js';

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

4. RESPECT DU DESIGN SYSTEM
   - TOUJOURS utiliser les couleurs du thème (jamais de hex custom)
   - TOUJOURS utiliser les polices du thème
   - TOUJOURS utiliser les tailles prédéfinies

5. VALIDATION
   - Si erreur de validation, lire attentivement le message
   - Corriger UNIQUEMENT les attributs en erreur
   - Réessayer (max 3 fois)

6. DÉLÉGATION AUX SUB-AGENTS
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
				// ...getGutenbergTools(this.gutenbergController),  // Phase 3
				...getFSETools(this.wordpressAPI),
			];

			logger.info(`Orchestrator initialized successfully with ${this.tools.length} tools`);
		} catch (error) {
			logger.error('Failed to initialize Orchestrator', { error: error.message });
			throw new AppError('Orchestrator initialization failed', 500);
		}
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
	 * @param {Function} options.onFinalResponse - Callback appelé avec la réponse finale
	 * @param {Function} options.onError - Callback appelé en cas d'erreur
	 * @returns {Promise<Object>} Résultat final
	 */
	async processRequestStream(userMessage, options = {}) {
		try {
			const {
				conversation_id,
				wordpress_context,
				onIterationStart,
				onToolCall,
				onToolResult,
				onFinalResponse,
				onError,
				...otherOptions
			} = options;

			logger.info('Processing user request (streaming)', {
				message: userMessage.substring(0, 100),
				has_context: !!wordpress_context,
				conversation_id: conversation_id || 'new',
				context: wordpress_context
			});

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

			// IMPORTANT: Si un contexte WordPress existe, injecter un message système au DÉBUT
			// (uniquement si c'est une nouvelle conversation ou si le contexte a changé)
			if (wordpress_context && wordpress_context.current_post_id) {
				// Vérifier si on a déjà injecté le contexte pour cette page
				const hasContextForThisPage = conversationHistory.some(msg =>
					msg.role === 'user' &&
					msg.content.includes(`ID: ${wordpress_context.current_post_id}`)
				);

				if (!hasContextForThisPage) {
					const contextMessage = `CONTEXTE WORDPRESS ACTUEL:
Tu es actuellement dans l'éditeur de la ${wordpress_context.post_type || 'page'} "${wordpress_context.post_title}" (ID: ${wordpress_context.current_post_id}, statut: ${wordpress_context.post_status || 'unknown'}).
Cette page contient ${wordpress_context.blocks_count || 0} bloc(s).

⚠️ IMPORTANT: L'utilisateur souhaite MODIFIER CETTE PAGE EXISTANTE, ne crée PAS une nouvelle page sauf si explicitement demandé.
Si l'utilisateur demande d'ajouter du contenu, utilise les outils pour modifier cette page (ID: ${wordpress_context.current_post_id}).
`;

					conversationHistory.push({
						role: 'user',
						content: contextMessage,
					});

					logger.info('WordPress context injected into conversation', {
						post_id: wordpress_context.current_post_id,
						post_title: wordpress_context.post_title,
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

			const toolsForAnthropic = this.tools.map((t) => ({
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
							const result = await this.executeTool(toolCall.name, toolCall.input);

							// Emit tool success event
							if (onToolResult) {
								onToolResult(toolCall.name, true, result);
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
	async executeTool(toolName, toolInput) {
		try {
			logger.info(`Executing tool: ${toolName}`, { input: toolInput });

			// Trouver le tool correspondant
			const tool = this.tools.find((t) => t.name === toolName);
			if (!tool) {
				throw new AppError(`Unknown tool: ${toolName}`, 400);
			}

			// Exécuter le handler du tool
			const result = await tool.handler(toolInput);

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
