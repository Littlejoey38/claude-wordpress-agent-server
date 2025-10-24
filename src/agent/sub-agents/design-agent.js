/**
 * Design Agent - Sub-agent spécialisé en UX/UI
 *
 * Assure cohérence visuelle, hiérarchie visuelle, accessibilité,
 * responsive design. Utilise le design system du thème.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../../utils/logger.js';

/**
 * System prompt pour le Design Agent (specs lignes 1197-1216)
 */
const DESIGN_AGENT_SYSTEM_PROMPT = `Tu es un designer UX/UI expert en WordPress et Gutenberg.

Ton rôle :
- Assurer cohérence visuelle (design system)
- Créer hiérarchie visuelle claire
- Optimiser espacements et layout
- Garantir accessibilité (WCAG AA minimum)
- Responsive design
- Utiliser couleurs/polices du thème

IMPORTANT :
- Contraste texte/fond : minimum 4.5:1
- Tailles de police : utiliser échelle du thème
- Espacements : utiliser tokens du thème
- Mobile-first approach
- Touch targets : minimum 44x44px

RÈGLES CRITIQUES :
1. TOUJOURS appeler get_theme_design_system en premier pour connaître les couleurs/polices disponibles
2. TOUJOURS utiliser les slugs du thème (primary, secondary) au lieu de valeurs hardcodées (#hex)
3. TOUJOURS vérifier le contraste avant d'appliquer des couleurs
4. NE JAMAIS utiliser update_global_styles sans demander confirmation à l'utilisateur

TOOLS DISPONIBLES :
Tu as accès uniquement aux tools de design (styles, couleurs, patterns, design system).
Concentre-toi sur la COHÉRENCE VISUELLE et l'ACCESSIBILITÉ.`;

/**
 * Classe DesignAgent
 */
export class DesignAgent {
	/**
	 * Constructeur
	 *
	 * @param {Object} anthropicClient - Client Anthropic
	 * @param {Object} config - Configuration globale
	 */
	constructor(anthropicClient, config) {
		this.anthropicClient = anthropicClient;
		this.config = config;
		this.systemPrompt = DESIGN_AGENT_SYSTEM_PROMPT;
	}

	/**
	 * Exécute une tâche de design
	 *
	 * @param {string} task - Description de la tâche
	 * @param {Object} context - Contexte additionnel
	 * @param {Array} tools - Tools filtrés pour cet agent
	 * @returns {Promise<Object>} Résultat des recommandations design
	 */
	async execute(task, context = {}, tools = []) {
		try {
			logger.info('🎨 Design Agent executing task', { task });

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
				agent: 'design',
				message: responseText,
				iterations: iterations,
				toolsExecuted: toolResults,
			};
		} catch (error) {
			logger.error('❌ Design Agent execution failed', { error: error.message });
			throw error;
		}
	}

	/**
	 * Retourne les tools spécifiques au Design Agent
	 *
	 * Filtre les tools selon SUBAGENTS_TOOLS_DISTRIBUTION.md
	 *
	 * @param {Array} allTools - Tous les tools disponibles
	 * @returns {Array} Liste des tools filtrés
	 */
	getTools(allTools) {
		// Liste des tools autorisés pour le Design Agent (voir SUBAGENTS_TOOLS_DISTRIBUTION.md)
		const allowedToolNames = [
			'discover_available_blocks',
			'get_theme_design_system',
			'get_page_summary',
			'get_blocks_structure',
			'inspect_block_schema',
			'get_block_attributes_group',
			'get_patterns',
			'get_pattern_details',
			'update_block_by_clientid',
			'update_block_by_agent_id',
			'insert_pattern',
			'swap_pattern',
			'update_global_styles',
		];

		const filteredTools = allTools.filter(tool => allowedToolNames.includes(tool.name));

		logger.debug('Design Agent tools filtered', {
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
		return 'Expert en UX/UI, cohérence visuelle, design system, accessibilité WCAG AA';
	}
}
