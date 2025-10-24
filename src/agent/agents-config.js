/**
 * Sub-Agents Configuration
 *
 * Définit les agents spécialisés au format AgentDefinition du Claude Agent SDK.
 * Claude choisit automatiquement quel agent utiliser basé sur la description.
 *
 * SDK: @anthropic-ai/claude-agent-sdk
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

/**
 * Configuration des agents spécialisés pour le Claude Agent SDK
 *
 * Format AgentDefinition (SDK):
 * {
 *   description: string  // Natural language description of when to use this agent
 *   tools?: string[]     // Array of allowed tool names. If omitted, inherits all tools
 *   prompt: string       // The agent's system prompt
 *   model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'  // Model override
 * }
 *
 * Usage dans l'orchestrateur:
 * ```javascript
 * import { query } from '@anthropic-ai/claude-agent-sdk';
 * import { agentsConfig } from './agents-config.js';
 *
 * const result = query({
 *   prompt: userRequest,
 *   options: {
 *     agents: agentsConfig,  // Claude choisit automatiquement
 *     allowedTools: [...],
 *   }
 * });
 * ```
 */
export const agentsConfig = {
	/**
	 * 🔍 SEO Agent
	 *
	 * Utilise cet agent quand la tâche concerne :
	 * - Optimisation SEO (meta descriptions, keywords, URL slugs)
	 * - Structure de contenu (hiérarchie H1/H2/H3)
	 * - Optimisation des titres pour le référencement
	 * - Alt text des images pour le SEO
	 */
	seo: {
		description: `Use this agent for SEO optimization tasks:
- Optimizing content structure (H1, H2, H3 hierarchy)
- Generating optimized meta descriptions (150-160 characters with CTA)
- Suggesting relevant keywords and their placement (1-2% density)
- Creating SEO-friendly URL slugs (short, descriptive, with hyphens)
- Optimizing image alt text
- Suggesting internal links
- Ensuring readability (Flesch score)

This agent is the expert for search engine optimization and content structure.`,

		tools: [
			'get_page_summary',
			'get_blocks_structure',
			'inspect_block_schema',
			'update_post_title',
			'update_block_by_clientid',
			'update_block_by_agent_id',
			'insert_block_realtime',
		],

		prompt: `Tu es un expert SEO spécialisé dans WordPress et Gutenberg.

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
Concentre-toi sur la STRUCTURE SEO et les MÉTADONNÉES.`,

		model: 'inherit', // Use the same model as the main orchestrator
	},

	/**
	 * ✍️ Copywriting Agent
	 *
	 * Utilise cet agent quand la tâche concerne :
	 * - Rédaction de contenu persuasif
	 * - Création de titres accrocheurs
	 * - Rédaction de CTAs efficaces
	 * - Storytelling et contenu engageant
	 * - Adaptation du ton à l'audience
	 */
	copywriting: {
		description: `Use this agent for content creation and persuasive writing tasks:
- Creating catchy headlines and attention-grabbing titles (AIDA, PAS frameworks)
- Writing engaging and persuasive content
- Generating effective CTAs (calls-to-action) that are action-oriented
- Adapting tone and voice to target audience
- Creating emotional connection and storytelling
- Structuring content for conversion

This agent is the expert for persuasive writing, marketing copy, and content creation.`,

		tools: [
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
		],

		prompt: `Tu es un copywriter expert en marketing digital et psychologie de la persuasion.

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
Concentre-toi sur la QUALITÉ et la PERSUASION du contenu.`,

		model: 'inherit',
	},

	/**
	 * 🎨 Design Agent
	 *
	 * Utilise cet agent quand la tâche concerne :
	 * - Design visuel et cohérence graphique
	 * - Couleurs, polices, espacements
	 * - Accessibilité (WCAG AA)
	 * - Design system et thème
	 * - Responsive design
	 */
	design: {
		description: `Use this agent for visual design and UX/UI tasks:
- Ensuring visual consistency using the theme's design system
- Creating clear visual hierarchy
- Optimizing spacing and layout
- Guaranteeing accessibility (WCAG AA minimum, 4.5:1 contrast ratio)
- Responsive design and mobile-first approach
- Using theme colors/fonts (slugs like "primary", "secondary", not hex values)
- Touch targets minimum 44x44px

This agent is the expert for visual design, accessibility, and design system adherence.`,

		tools: [
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
		],

		prompt: `Tu es un designer UX/UI expert en WordPress et Gutenberg.

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
Concentre-toi sur la COHÉRENCE VISUELLE et l'ACCESSIBILITÉ.`,

		model: 'inherit',
	},
};

/**
 * Retourne les noms des agents affichables
 *
 * @param {string} agentKey - Clé de l'agent (seo, copywriting, design)
 * @returns {string} Nom d'affichage avec emoji
 */
export function getAgentDisplayName(agentKey) {
	const names = {
		seo: '🔍 SEO Agent',
		copywriting: '✍️ Copywriting Agent',
		design: '🎨 Design Agent',
	};

	return names[agentKey] || agentKey;
}

/**
 * Retourne la liste des agents disponibles
 *
 * @returns {Array} Liste des agents avec leurs infos
 */
export function listAgents() {
	return Object.entries(agentsConfig).map(([key, config]) => ({
		key,
		name: getAgentDisplayName(key),
		description: config.description,
		toolsCount: config.tools?.length || 0,
		model: config.model,
	}));
}
