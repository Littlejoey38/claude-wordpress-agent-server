/**
 * Full Site Editing (FSE) Tools
 *
 * Tools pour manipuler les templates de site, global styles,
 * theme.json, navigation, widgets.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../../utils/logger.js';

/**
 * Retourne la liste des tools FSE pour Claude
 *
 * @param {Object} wordpressAPI - Instance du client WordPress API
 * @returns {Array} Liste des tools au format Anthropic
 */
export function getFSETools(wordpressAPI) {
	return [
		// 1. Récupérer les templates de site
		{
			name: 'get_site_templates',
			description: 'Récupère tous les templates de site disponibles (page, single, archive, 404, etc.) organisés par catégorie. Utilise pour comprendre la structure du thème.',
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async (input) => {
				logger.info('Tool: get_site_templates');
				return await wordpressAPI.getTemplates();
			},
		},

		// 2. Récupérer les template parts
		{
			name: 'get_template_parts',
			description: 'Récupère toutes les template parts (header, footer, sidebar, etc.) qui composent les templates de site. Les template parts sont des sections réutilisables.',
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async (input) => {
				logger.info('Tool: get_template_parts');
				// Note: Cette méthode n'existe peut-être pas encore dans WordPressAPI
				// Pour l'instant on retourne getTemplates() qui contient les template parts
				return await wordpressAPI.getTemplates();
			},
		},

		// 3. Mettre à jour les global styles
		{
			name: 'update_global_styles',
			description: 'Met à jour les styles globaux du site (couleurs, polices, espacements, etc.). ATTENTION: Utilise avec précaution car cela affecte tout le site.',
			input_schema: {
				type: 'object',
				properties: {
					styles: {
						type: 'object',
						description: 'Objet de styles au format theme.json (colors, typography, spacing, etc.)',
					},
				},
				required: ['styles'],
			},
			handler: async (input) => {
				logger.info('Tool: update_global_styles');
				return await wordpressAPI.updateGlobalStyles(input.styles);
			},
		},

		// 4. Récupérer le theme.json (si disponible)
		{
			name: 'get_theme_info',
			description: 'Récupère les informations sur le thème actif, incluant les fonctionnalités supportées et la configuration. Note: get_theme_design_system est préférable pour obtenir les styles.',
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async (input) => {
				logger.info('Tool: get_theme_info');
				// Utilise getSystemInfo qui contient les infos du thème
				const systemInfo = await wordpressAPI.getSystemInfo();
				return {
					theme: systemInfo.theme || 'Unknown',
					theme_supports: systemInfo.theme_supports || {},
					// Ajouter d'autres infos pertinentes
				};
			},
		},
	];
}
