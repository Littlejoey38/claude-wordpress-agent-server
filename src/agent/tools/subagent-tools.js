/**
 * Sub-Agent Tools
 *
 * Tool pour déléguer des tâches spécialisées aux sub-agents
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../../utils/logger.js';
import { SEOAgent } from '../sub-agents/seo-agent.js';
import { CopywritingAgent } from '../sub-agents/copywriting-agent.js';
import { DesignAgent } from '../sub-agents/design-agent.js';
import { agentsConfig } from '../agents-config.js';

/**
 * Retourne le tool de délégation aux sub-agents
 *
 * @param {Object} anthropicClient - Client Anthropic
 * @param {Array} allTools - Tous les tools disponibles
 * @param {Object} config - Configuration
 * @returns {Array} Tool delegate_to_subagent
 */
export function getSubAgentTools(anthropicClient, allTools, config) {
	return [
		{
			name: 'delegate_to_subagent',
			description: `Délègue une tâche spécialisée à un sub-agent expert.

⭐ UTILISE CE TOOL QUAND:
- La tâche nécessite une expertise spécifique (SEO, copywriting, design)
- Tu veux une analyse approfondie d'un aspect particulier
- La demande utilisateur mentionne explicitement SEO, contenu persuasif, ou design

🔍 SEO Agent: Utilise pour optimisation SEO
   - Optimiser la structure de contenu (H1/H2/H3)
   - Générer meta descriptions optimisées (150-160 caractères)
   - Créer des URL slugs SEO-friendly
   - Placer des mots-clés stratégiquement (densité 1-2%)
   - Optimiser les alt text d'images

✍️ Copywriting Agent: Utilise pour rédaction persuasive
   - Créer des titres accrocheurs (AIDA, PAS frameworks)
   - Rédiger du contenu engageant et persuasif
   - Générer des CTAs efficaces et action-oriented
   - Adapter le ton à l'audience cible
   - Utiliser le storytelling

🎨 Design Agent: Utilise pour design visuel
   - Assurer la cohérence visuelle (design system)
   - Vérifier l'accessibilité (WCAG AA, contraste 4.5:1)
   - Optimiser espacements et layout
   - Choisir couleurs/polices du thème
   - Responsive design

Le sub-agent recevra un system prompt spécialisé et n'aura accès qu'aux tools pertinents.`,

			input_schema: {
				type: 'object',
				properties: {
					agent: {
						type: 'string',
						enum: ['seo', 'copywriting', 'design'],
						description: 'Quel sub-agent expert utiliser (seo, copywriting, ou design)',
					},
					task: {
						type: 'string',
						description: 'Description claire de la tâche à accomplir. Soit spécifique.',
					},
					context: {
						type: 'object',
						description: 'Contexte additionnel (post_id, current_content, design_system, etc.)',
					},
				},
				required: ['agent', 'task'],
			},

			handler: async (input) => {
				// Support both 'agent' and 'agent_type' for compatibility
				const agent = input.agent || input.agent_type;
				const { task, context = {} } = input;

				logger.info(`🤖 Delegating to ${agent} agent`, { task: task.substring(0, 100) });

				// Récupérer la config de l'agent
				const agentConfig = agentsConfig[agent];
				if (!agentConfig) {
					throw new Error(`Unknown agent: ${agent}. Available: seo, copywriting, design`);
				}

				// Filtrer les tools pour cet agent
				const agentTools = allTools.filter(tool =>
					agentConfig.tools.includes(tool.name)
				);

				logger.info(`${agentConfig.description.split('\n')[0]}`, {
					toolsCount: agentTools.length,
					tools: agentTools.map(t => t.name),
				});

				// Instancier le sub-agent approprié
				let subAgent;
				switch (agent) {
					case 'seo':
						subAgent = new SEOAgent(anthropicClient, config);
						break;
					case 'copywriting':
						subAgent = new CopywritingAgent(anthropicClient, config);
						break;
					case 'design':
						subAgent = new DesignAgent(anthropicClient, config);
						break;
					default:
						throw new Error(`Unknown agent: ${agent}`);
				}

				// Exécuter la tâche avec le sub-agent
				try {
					const result = await subAgent.execute(task, context, agentTools);

					logger.info(`✅ ${agent} agent completed`, {
						success: result.success,
					});

					return {
						success: true,
						agent: agent,
						agentName: getAgentDisplayName(agent),
						message: `✅ ${getAgentDisplayName(agent)} completed the task`,
						result: result,
					};
				} catch (error) {
					logger.error(`❌ ${agent} agent failed`, {
						error: error.message,
					});

					return {
						success: false,
						agent: agent,
						agentName: getAgentDisplayName(agent),
						error: error.message,
						message: `❌ ${getAgentDisplayName(agent)} encountered an error: ${error.message}`,
					};
				}
			},
		},
	];
}

/**
 * Helper pour obtenir le nom d'affichage de l'agent
 */
function getAgentDisplayName(agentKey) {
	const names = {
		seo: '🔍 SEO Agent',
		copywriting: '✍️ Copywriting Agent',
		design: '🎨 Design Agent',
	};
	return names[agentKey] || agentKey;
}
