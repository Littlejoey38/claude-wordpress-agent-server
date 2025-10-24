/**
 * SEO Agent - Sub-agent spécialisé en optimisation SEO
 *
 * Optimise la structure de contenu, génère meta descriptions,
 * suggère mots-clés, crée slugs URL, optimise alt text.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../../utils/logger.js';

/**
 * System prompt pour le SEO Agent (specs lignes 1132-1151)
 */
const SEO_AGENT_SYSTEM_PROMPT = `Tu es un expert SEO spécialisé dans WordPress et Gutenberg.

Ton rôle :
- Optimiser la structure de contenu (H1, H2, H3 hiérarchie)
- Générer meta descriptions optimisées
- Suggérer mots-clés pertinents et leur placement
- Créer des slugs URL SEO-friendly
- Optimiser les alt text des images
- Suggérer des liens internes
- Garantir lisibilité (score Flesch)

IMPORTANT :
- Mots-clés : densité 1-2%, placement naturel
- Meta description : 150-160 caractères, avec CTA
- H1 : unique, avec mot-clé principal
- H2/H3 : structure claire, avec mots-clés secondaires
- URL slug : court, descriptif, avec tirets

RÈGLES CRITIQUES :
1. TOUJOURS analyser la structure existante avec get_blocks_structure avant toute modification
2. RESPECTER la hiérarchie des headings (H1 unique, H2 pour sections, H3 pour sous-sections)
3. NE PAS supprimer de contenu, seulement optimiser
4. Utiliser update_post_title pour modifier titre, slug, meta description (excerpt)
5. Utiliser insert_block_realtime uniquement si un heading manque dans la structure

TOOLS DISPONIBLES :
Tu as accès uniquement aux tools d'analyse et de modification des métadonnées/headings.
Concentre-toi sur la STRUCTURE SEO et les MÉTADONNÉES.`;

/**
 * Classe SEOAgent
 */
export class SEOAgent {
	/**
	 * Constructeur
	 *
	 * @param {Object} anthropicClient - Client Anthropic
	 * @param {Object} config - Configuration globale
	 */
	constructor(anthropicClient, config) {
		this.anthropicClient = anthropicClient;
		this.config = config;
		this.systemPrompt = SEO_AGENT_SYSTEM_PROMPT;
	}

	/**
	 * Exécute une tâche SEO
	 *
	 * @param {string} task - Description de la tâche
	 * @param {Object} context - Contexte additionnel
	 * @param {Array} tools - Tools filtrés pour cet agent
	 * @returns {Promise<Object>} Résultat de l'analyse/optimisation SEO
	 */
	async execute(task, context = {}, tools = []) {
		try {
			logger.info('🔍 SEO Agent executing task', { task });

			// Historique de conversation pour le sub-agent
			const conversationHistory = [
				{
					role: 'user',
					content: `Task: ${task}\n\nContext: ${JSON.stringify(context, null, 2)}`,
				},
			];

			// Préparer les tools au format Anthropic
			const toolsForAnthropic = tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				input_schema: tool.input_schema,
			}));

			// Boucle d'interaction (max 10 iterations pour un sub-agent)
			let continueLoop = true;
			let iterations = 0;
			const maxIterations = 10;
			let finalResponse = null;
			const toolResults = [];

			while (continueLoop && iterations < maxIterations) {
				iterations++;

				// Appeler Claude
				const response = await this.anthropicClient.sendMessage({
					system: this.systemPrompt,
					messages: conversationHistory,
					tools: toolsForAnthropic,
					max_tokens: 4096,
				});

				if (response.stop_reason === 'tool_use') {
					// Claude demande d'exécuter des tools
					const toolCalls = this.anthropicClient.extractToolCalls(response);

					// Ajouter la réponse à l'historique
					conversationHistory.push({
						role: 'assistant',
						content: response.content,
					});

					// Exécuter les tools
					const results = [];
					for (const toolCall of toolCalls) {
						try {
							const tool = tools.find(t => t.name === toolCall.name);
							if (!tool) {
								throw new Error(`Tool not available: ${toolCall.name}`);
							}

							const result = await tool.handler(toolCall.input);

							results.push({
								type: 'tool_result',
								tool_use_id: toolCall.id,
								content: JSON.stringify(result),
							});

							// Garder trace des résultats pour le retour final
							toolResults.push({
								tool: toolCall.name,
								input: toolCall.input,
								result: result,
							});
						} catch (error) {
							results.push({
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
						content: results,
					});
				} else if (response.stop_reason === 'end_turn') {
					finalResponse = response;
					continueLoop = false;
				} else {
					finalResponse = response;
					continueLoop = false;
				}
			}

			// Extraire le texte final
			const responseText = finalResponse
				? this.anthropicClient.extractText(finalResponse)
				: 'No response generated';

			return {
				success: true,
				agent: 'seo',
				message: responseText,
				iterations: iterations,
				toolsExecuted: toolResults,
			};
		} catch (error) {
			logger.error('❌ SEO Agent execution failed', { error: error.message });
			throw error;
		}
	}

	/**
	 * Retourne les tools spécifiques au SEO Agent
	 *
	 * Filtre les tools selon SUBAGENTS_TOOLS_DISTRIBUTION.md
	 *
	 * @param {Array} allTools - Tous les tools disponibles
	 * @returns {Array} Liste des tools filtrés
	 */
	getTools(allTools) {
		// Liste des tools autorisés pour le SEO Agent (voir SUBAGENTS_TOOLS_DISTRIBUTION.md)
		const allowedToolNames = [
			'get_page_summary',
			'get_blocks_structure',
			'inspect_block_schema',
			'update_post_title',
			'update_block_by_clientid',
			'update_block_by_agent_id',
			'insert_block_realtime',
		];

		const filteredTools = allTools.filter(tool => allowedToolNames.includes(tool.name));

		logger.debug('SEO Agent tools filtered', {
			total: allTools.length,
			filtered: filteredTools.length,
			toolNames: filteredTools.map(t => t.name),
		});

		return filteredTools;
	}

	/**
	 * Retourne la description de l'agent
	 *
	 * @returns {string} Description
	 */
	getDescription() {
		return 'Expert SEO, structure de contenu, meta descriptions, mots-clés, URL slugs';
	}
}
