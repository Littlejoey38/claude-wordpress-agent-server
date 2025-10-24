/**
 * Copywriting Agent - Sub-agent spécialisé en rédaction persuasive
 *
 * Crée des titres accrocheurs, contenu engageant, CTAs efficaces.
 * Utilise frameworks AIDA, PAS, storytelling, psychologie de la persuasion.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../../utils/logger.js';

/**
 * System prompt pour le Copywriting Agent (specs lignes 1165-1184)
 */
const COPYWRITING_AGENT_SYSTEM_PROMPT = `Tu es un copywriter expert en marketing digital et psychologie de la persuasion.

Ton rôle :
- Créer des titres accrocheurs (AIDA, PAS frameworks)
- Rédiger du contenu engageant et persuasif
- Générer des CTAs efficaces
- Adapter le ton à l'audience cible
- Créer de l'émotion et de la connexion
- Structurer le contenu pour la conversion

IMPORTANT :
- Toujours commencer par un hook fort
- Utiliser storytelling quand approprié
- CTAs clairs et action-oriented
- Bénéfices avant features
- Preuve sociale quand possible
- Urgence/scarcité avec éthique

TOOLS DISPONIBLES :
Tu as accès uniquement aux tools de copywriting (création et modification de contenu).
Concentre-toi sur la QUALITÉ et la PERSUASION du contenu.`;

/**
 * Classe CopywritingAgent
 */
export class CopywritingAgent {
	/**
	 * Constructeur
	 *
	 * @param {Object} anthropicClient - Client Anthropic
	 * @param {Object} config - Configuration globale
	 */
	constructor(anthropicClient, config) {
		this.anthropicClient = anthropicClient;
		this.config = config;
		this.systemPrompt = COPYWRITING_AGENT_SYSTEM_PROMPT;
	}

	/**
	 * Exécute une tâche de copywriting
	 *
	 * @param {string} task - Description de la tâche
	 * @param {Object} context - Contexte additionnel
	 * @param {Array} tools - Tools filtrés pour cet agent
	 * @returns {Promise<Object>} Résultat du copywriting
	 */
	async execute(task, context = {}, tools = []) {
		try {
			logger.info('✍️ Copywriting Agent executing task', { task });

			const conversationHistory = [
				{
					role: 'user',
					content: `Task: ${task}\n\nContext: ${JSON.stringify(context, null, 2)}`,
				},
			];

			const toolsForAnthropic = tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				input_schema: tool.input_schema,
			}));

			let continueLoop = true;
			let iterations = 0;
			const maxIterations = 10;
			let finalResponse = null;
			const toolResults = [];

			while (continueLoop && iterations < maxIterations) {
				iterations++;

				const response = await this.anthropicClient.sendMessage({
					system: this.systemPrompt,
					messages: conversationHistory,
					tools: toolsForAnthropic,
					max_tokens: 4096,
				});

				if (response.stop_reason === 'tool_use') {
					const toolCalls = this.anthropicClient.extractToolCalls(response);

					conversationHistory.push({
						role: 'assistant',
						content: response.content,
					});

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

			const responseText = finalResponse
				? this.anthropicClient.extractText(finalResponse)
				: 'No response generated';

			return {
				success: true,
				agent: 'copywriting',
				message: responseText,
				iterations: iterations,
				toolsExecuted: toolResults,
			};
		} catch (error) {
			logger.error('❌ Copywriting Agent execution failed', { error: error.message });
			throw error;
		}
	}

	/**
	 * Retourne les tools spécifiques au Copywriting Agent
	 *
	 * Filtre les tools selon SUBAGENTS_TOOLS_DISTRIBUTION.md
	 *
	 * @param {Array} allTools - Tous les tools disponibles
	 * @returns {Array} Liste des tools filtrés
	 */
	getTools(allTools) {
		// Liste des tools autorisés pour le Copywriting Agent (voir SUBAGENTS_TOOLS_DISTRIBUTION.md)
		const allowedToolNames = [
			'discover_available_blocks',
			'get_page_summary',
			'get_blocks_structure',
			'inspect_block_schema',
			'get_patterns',
			'get_pattern_details',
			'insert_block_realtime',
			'insert_pattern',
			'create_post',
			'update_block_by_clientid',
			'update_block_by_agent_id',
			'replace_block_realtime',
			'replace_block_by_agent_id',
		];

		const filteredTools = allTools.filter(tool => allowedToolNames.includes(tool.name));

		logger.debug('Copywriting Agent tools filtered', {
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
		return 'Expert en rédaction persuasive, titres accrocheurs, CTAs efficaces';
	}
}
