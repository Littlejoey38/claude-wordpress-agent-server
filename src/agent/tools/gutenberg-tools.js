/**
 * Gutenberg Tools
 *
 * Tools pour manipuler l'éditeur Gutenberg via Playwright :
 * créer, modifier, supprimer blocs, naviguer dans l'éditeur.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../../utils/logger.js';

/**
 * Retourne la liste des tools Gutenberg pour Claude
 *
 * @param {Object} gutenbergController - Instance du controller Playwright
 * @returns {Array} Liste des tools au format Anthropic
 */
export function getGutenbergTools(gutenbergController) {
	return [
		{
			name: 'insert_block',
			description: 'Insère un bloc dans l\'éditeur Gutenberg',
			input_schema: {
				type: 'object',
				properties: {
					block_name: { type: 'string' },
					attributes: { type: 'object', description: 'Attributs validés du bloc' },
					position: { type: 'number', description: 'Position d\'insertion (null = fin)' },
				},
				required: ['block_name', 'attributes'],
			},
			handler: async (input) => {
				logger.info('Tool: insert_block', { block: input.block_name });
				return await gutenbergController.insertBlock(
					input.block_name,
					input.attributes,
					input.position
				);
			},
		},

		{
			name: 'update_block',
			description: 'Met à jour les attributs d\'un bloc existant',
			input_schema: {
				type: 'object',
				properties: {
					client_id: { type: 'string', description: 'ID client du bloc dans Gutenberg' },
					attributes: { type: 'object' },
				},
				required: ['client_id', 'attributes'],
			},
			handler: async (input) => {
				logger.info('Tool: update_block', { client_id: input.client_id });
				return await gutenbergController.updateBlockAttributes(
					input.client_id,
					input.attributes
				);
			},
		},

		{
			name: 'remove_block',
			description: 'Supprime un bloc de l\'éditeur',
			input_schema: {
				type: 'object',
				properties: {
					client_id: { type: 'string' },
				},
				required: ['client_id'],
			},
			handler: async (input) => {
				logger.info('Tool: remove_block', { client_id: input.client_id });
				return await gutenbergController.removeBlock(input.client_id);
			},
		},

		{
			name: 'validate_block',
			description: 'Valide un bloc après insertion pour vérifier qu\'il est correct',
			input_schema: {
				type: 'object',
				properties: {
					client_id: { type: 'string' },
				},
				required: ['client_id'],
			},
			handler: async (input) => {
				logger.info('Tool: validate_block', { client_id: input.client_id });
				return await gutenbergController.validateBlock(input.client_id);
			},
		},

		{
			name: 'get_all_blocks',
			description: 'Récupère tous les blocs actuellement dans l\'éditeur',
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async (input) => {
				logger.info('Tool: get_all_blocks');
				return await gutenbergController.getAllBlocks();
			},
		},

		{
			name: 'navigate_to_post',
			description: 'Navigue vers l\'éditeur d\'un post spécifique',
			input_schema: {
				type: 'object',
				properties: {
					post_id: { type: 'number' },
				},
				required: ['post_id'],
			},
			handler: async (input) => {
				logger.info('Tool: navigate_to_post', { post_id: input.post_id });
				return await gutenbergController.navigateToPost(input.post_id);
			},
		},

		{
			name: 'save_post',
			description: 'Sauvegarde le post actuellement ouvert dans l\'éditeur',
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async (input) => {
				logger.info('Tool: save_post');
				return await gutenbergController.savePost();
			},
		},

		{
			name: 'insert_pattern',
			description: 'Insère un pattern WordPress dans l\'éditeur',
			input_schema: {
				type: 'object',
				properties: {
					pattern_name: { type: 'string' },
				},
				required: ['pattern_name'],
			},
			handler: async (input) => {
				logger.info('Tool: insert_pattern', { pattern: input.pattern_name });
				return await gutenbergController.insertPattern(input.pattern_name);
			},
		},

		{
			name: 'apply_theme_color',
			description: 'Applique une couleur du thème à un bloc',
			input_schema: {
				type: 'object',
				properties: {
					client_id: { type: 'string' },
					color_slug: { type: 'string', description: 'Slug de couleur du thème' },
					color_type: { type: 'string', enum: ['backgroundColor', 'textColor'] },
				},
				required: ['client_id', 'color_slug'],
			},
			handler: async (input) => {
				logger.info('Tool: apply_theme_color', input);
				return await gutenbergController.setBlockColor(
					input.client_id,
					input.color_slug,
					input.color_type || 'backgroundColor'
				);
			},
		},

		{
			name: 'apply_theme_font',
			description: 'Applique une police du thème à un bloc',
			input_schema: {
				type: 'object',
				properties: {
					client_id: { type: 'string' },
					font_slug: { type: 'string' },
					font_size: { type: 'string' },
				},
				required: ['client_id', 'font_slug'],
			},
			handler: async (input) => {
				logger.info('Tool: apply_theme_font', input);
				return await gutenbergController.setBlockFont(
					input.client_id,
					input.font_slug,
					input.font_size
				);
			},
		},
	];
}
