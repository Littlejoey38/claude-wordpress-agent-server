/**
 * Gutenberg Controller
 *
 * Contrôle l'éditeur Gutenberg via Playwright en utilisant
 * le bridge JavaScript exposé par le plugin WordPress.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import { chromium } from 'playwright';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * Classe GutenbergController
 */
export class GutenbergController {
	/**
	 * Constructeur
	 *
	 * @param {Object} config - Configuration Playwright
	 * @param {boolean} config.headless - Mode headless
	 * @param {number} config.timeout - Timeout par défaut
	 */
	constructor(config) {
		this.config = config;
		this.browser = null;
		this.context = null;
		this.page = null;
	}

	/**
	 * Initialise Playwright et le navigateur
	 *
	 * @returns {Promise<void>}
	 */
	async initialize() {
		try {
			logger.info('Initializing Gutenberg Controller (Playwright)');

			// Lancer le navigateur
			this.browser = await chromium.launch({
				headless: this.config.headless,
				timeout: this.config.timeout,
			});

			// Créer un contexte avec permissions
			this.context = await this.browser.newContext({
				viewport: { width: 1920, height: 1080 },
				ignoreHTTPSErrors: true,
			});

			// Créer une page
			this.page = await this.context.newPage();

			// Augmenter le timeout par défaut
			this.page.setDefaultTimeout(this.config.timeout);

			logger.info('Gutenberg Controller initialized successfully');
		} catch (error) {
			logger.error('Failed to initialize Gutenberg Controller', { error: error.message });
			throw new AppError('Gutenberg Controller initialization failed', 500);
		}
	}

	/**
	 * Navigue vers l'éditeur d'un post spécifique
	 *
	 * @param {string} wordpressUrl - URL de base WordPress
	 * @param {number} postId - ID du post
	 * @returns {Promise<void>}
	 */
	async navigateToPost(wordpressUrl, postId) {
		try {
			const url = `${wordpressUrl}/wp-admin/post.php?post=${postId}&action=edit`;
			logger.info('Navigating to post editor', { post_id: postId, url });

			await this.page.goto(url, { waitUntil: 'networkidle' });

			// Attendre que le bridge Gutenberg soit disponible
			await this.page.waitForFunction(() => window.ClaudeGutenbergBridge !== undefined, {
				timeout: 10000,
			});

			logger.info('Successfully navigated to post editor');
		} catch (error) {
			logger.error('Failed to navigate to post', { error: error.message });
			throw new AppError(`Navigation failed: ${error.message}`, 500);
		}
	}

	/**
	 * Insère un bloc dans l'éditeur
	 *
	 * @param {string} blockName - Nom du bloc (ex: core/paragraph)
	 * @param {Object} attributes - Attributs du bloc
	 * @param {number|null} position - Position d'insertion
	 * @returns {Promise<Object>} Résultat avec clientId
	 */
	async insertBlock(blockName, attributes, position = null) {
		try {
			logger.info('Inserting block', { block: blockName, position });

			const result = await this.page.evaluate(
				({ name, attrs, pos }) => {
					return window.ClaudeGutenbergBridge.insertBlockSafe(name, attrs, pos);
				},
				{ name: blockName, attrs: attributes, pos: position }
			);

			if (!result.success) {
				throw new AppError(`Block insertion failed: ${result.error}`, 400);
			}

			logger.info('Block inserted successfully', { client_id: result.clientId });
			return result;
		} catch (error) {
			logger.error('Failed to insert block', { error: error.message });
			throw error;
		}
	}

	/**
	 * Met à jour les attributs d'un bloc
	 *
	 * @param {string} clientId - Client ID du bloc
	 * @param {Object} attributes - Nouveaux attributs
	 * @returns {Promise<boolean>} Succès
	 */
	async updateBlockAttributes(clientId, attributes) {
		try {
			logger.info('Updating block attributes', { client_id: clientId });

			const success = await this.page.evaluate(
				({ id, attrs }) => {
					return window.ClaudeGutenbergBridge.updateBlockAttributes(id, attrs);
				},
				{ id: clientId, attrs: attributes }
			);

			if (!success) {
				throw new AppError('Block update failed', 400);
			}

			logger.info('Block updated successfully');
			return true;
		} catch (error) {
			logger.error('Failed to update block', { error: error.message });
			throw error;
		}
	}

	/**
	 * Supprime un bloc
	 *
	 * @param {string} clientId - Client ID du bloc
	 * @returns {Promise<boolean>} Succès
	 */
	async removeBlock(clientId) {
		try {
			logger.info('Removing block', { client_id: clientId });

			const success = await this.page.evaluate(
				({ id }) => {
					return window.ClaudeGutenbergBridge.removeBlock(id);
				},
				{ id: clientId }
			);

			if (!success) {
				throw new AppError('Block removal failed', 400);
			}

			logger.info('Block removed successfully');
			return true;
		} catch (error) {
			logger.error('Failed to remove block', { error: error.message });
			throw error;
		}
	}

	/**
	 * Valide un bloc
	 *
	 * @param {string} clientId - Client ID du bloc
	 * @returns {Promise<boolean>} Validité
	 */
	async validateBlock(clientId) {
		try {
			const isValid = await this.page.evaluate(
				({ id }) => {
					return window.ClaudeGutenbergBridge.validateBlock(id);
				},
				{ id: clientId }
			);

			logger.info('Block validation result', { client_id: clientId, valid: isValid });
			return isValid;
		} catch (error) {
			logger.error('Failed to validate block', { error: error.message });
			throw error;
		}
	}

	/**
	 * Récupère tous les blocs de l'éditeur
	 *
	 * @returns {Promise<Array>} Liste des blocs
	 */
	async getAllBlocks() {
		try {
			const blocks = await this.page.evaluate(() => {
				return window.ClaudeGutenbergBridge.getAllBlocks();
			});

			logger.info('Retrieved all blocks', { count: blocks.length });
			return blocks;
		} catch (error) {
			logger.error('Failed to get all blocks', { error: error.message });
			throw error;
		}
	}

	/**
	 * Sauvegarde le post
	 *
	 * @returns {Promise<void>}
	 */
	async savePost() {
		try {
			logger.info('Saving post');

			await this.page.evaluate(() => {
				return window.ClaudeGutenbergBridge.savePost();
			});

			// Attendre la fin de la sauvegarde
			await this.page.waitForSelector('.editor-post-saved-state.is-saved', { timeout: 10000 });

			logger.info('Post saved successfully');
		} catch (error) {
			logger.error('Failed to save post', { error: error.message });
			throw error;
		}
	}

	/**
	 * Insère un pattern
	 *
	 * @param {string} patternName - Nom du pattern
	 * @returns {Promise<boolean>} Succès
	 */
	async insertPattern(patternName) {
		try {
			logger.info('Inserting pattern', { pattern: patternName });

			const success = await this.page.evaluate(
				({ name }) => {
					return window.ClaudeGutenbergBridge.insertPattern(name);
				},
				{ name: patternName }
			);

			if (!success) {
				throw new AppError('Pattern insertion failed', 400);
			}

			logger.info('Pattern inserted successfully');
			return true;
		} catch (error) {
			logger.error('Failed to insert pattern', { error: error.message });
			throw error;
		}
	}

	/**
	 * Applique une couleur du thème à un bloc
	 *
	 * @param {string} clientId - Client ID du bloc
	 * @param {string} colorSlug - Slug de la couleur
	 * @param {string} colorType - Type de couleur (backgroundColor, textColor)
	 * @returns {Promise<boolean>} Succès
	 */
	async setBlockColor(clientId, colorSlug, colorType = 'backgroundColor') {
		try {
			logger.info('Setting block color', { client_id: clientId, color: colorSlug });

			const success = await this.page.evaluate(
				({ id, slug, type }) => {
					return window.ClaudeGutenbergBridge.setBlockColor(id, slug, type);
				},
				{ id: clientId, slug: colorSlug, type: colorType }
			);

			return success;
		} catch (error) {
			logger.error('Failed to set block color', { error: error.message });
			throw error;
		}
	}

	/**
	 * Applique une police du thème à un bloc
	 *
	 * @param {string} clientId - Client ID du bloc
	 * @param {string} fontSlug - Slug de la police
	 * @param {string} fontSize - Taille de police
	 * @returns {Promise<boolean>} Succès
	 */
	async setBlockFont(clientId, fontSlug, fontSize) {
		try {
			logger.info('Setting block font', { client_id: clientId, font: fontSlug });

			const success = await this.page.evaluate(
				({ id, font, size }) => {
					return window.ClaudeGutenbergBridge.setBlockFont(id, font, size);
				},
				{ id: clientId, font: fontSlug, size: fontSize }
			);

			return success;
		} catch (error) {
			logger.error('Failed to set block font', { error: error.message });
			throw error;
		}
	}

	/**
	 * Ferme le navigateur
	 *
	 * @returns {Promise<void>}
	 */
	async close() {
		try {
			logger.info('Closing Gutenberg Controller');

			if (this.browser) {
				await this.browser.close();
			}

			logger.info('Gutenberg Controller closed');
		} catch (error) {
			logger.error('Error closing Gutenberg Controller', { error: error.message });
		}
	}
}
