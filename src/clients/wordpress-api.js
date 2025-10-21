/**
 * WordPress API Client
 *
 * Client pour interagir avec l'API REST de WordPress.
 * Gère l'authentification, les requêtes HTTP, le cache Redis.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { RedisCache } from '../cache/redis-cache.js';

/**
 * Classe WordPressAPI
 */
export class WordPressAPI {
	/**
	 * Constructeur
	 *
	 * @param {Object} config - Configuration WordPress
	 * @param {string} config.url - URL du site WordPress
	 * @param {string} config.user - Nom d'utilisateur
	 * @param {string} config.appPassword - Application Password
	 * @param {RedisCache} cache - Instance de RedisCache (optionnel)
	 */
	constructor(config, cache = null) {
		this.config = config;
		this.baseURL = config.url.replace(/\/$/, ''); // Retirer le trailing slash
		this.client = null;
		this.cache = cache;
	}

	/**
	 * Initialise le client HTTP Axios
	 *
	 * @returns {Promise<void>}
	 */
	async initialize() {
		try {
			logger.info('Initializing WordPress API client', { url: this.baseURL });

			// Créer l'instance Axios avec authentification
			this.client = axios.create({
				baseURL: `${this.baseURL}/wp-json`,
				auth: {
					username: this.config.user,
					password: this.config.appPassword,
				},
				headers: {
					'Content-Type': 'application/json',
				},
				timeout: 30000, // 30 secondes
			});

			// Intercepteur pour logger les requêtes
			this.client.interceptors.request.use(
				(config) => {
					logger.http(`WordPress API: ${config.method.toUpperCase()} ${config.url}`);
					return config;
				},
				(error) => {
					logger.error('WordPress API request error', { error: error.message });
					return Promise.reject(error);
				}
			);

			// Intercepteur pour gérer les erreurs de réponse
			this.client.interceptors.response.use(
				(response) => response,
				(error) => {
					const message = error.response?.data?.message || error.message;
					logger.error('WordPress API response error', {
						status: error.response?.status,
						message,
					});
					throw new AppError(`WordPress API error: ${message}`, error.response?.status || 500);
				}
			);

			// Tester la connexion
			await this.testConnection();

			logger.info('WordPress API client initialized successfully');
		} catch (error) {
			logger.error('Failed to initialize WordPress API client', { error: error.message });
			throw error;
		}
	}

	/**
	 * Teste la connexion à l'API WordPress
	 *
	 * @returns {Promise<Object>} Informations système
	 */
	async testConnection() {
		try {
			const response = await this.client.get('/claude-agent/v1/system/info');
			logger.info('WordPress API connection test successful', {
				wp_version: response.data.wp_version,
			});
			return response.data;
		} catch (error) {
			throw new AppError('Failed to connect to WordPress API', 500);
		}
	}

	/**
	 * Récupère le résumé de tous les blocs disponibles
	 *
	 * @returns {Promise<Object>} Résumé des blocs
	 */
	async getBlocksSummary() {
		const response = await this.client.get('/claude-agent/v1/blocks/summary');
		return response.data;
	}

	/**
	 * Récupère le schéma complet d'un bloc
	 *
	 * @param {string} blockName - Nom du bloc (ex: core/paragraph)
	 * @returns {Promise<Object>} Schéma du bloc
	 */
	async getBlockSchema(blockName) {
		// Vérifier le cache
		if (this.cache) {
			const cacheKey = RedisCache.blockSchemaKey(blockName);
			const cached = await this.cache.get(cacheKey);
			if (cached) {
				logger.debug('Block schema retrieved from cache', { blockName });
				return cached;
			}
		}

		// Le nom du bloc (ex: core/cover) est utilisé tel quel dans l'URL
		// WordPress REST API accepte le slash comme partie du chemin
		const response = await this.client.get(`/claude-agent/v1/blocks/${blockName}/schema`);

		// Mettre en cache
		if (this.cache) {
			const cacheKey = RedisCache.blockSchemaKey(blockName);
			await this.cache.set(cacheKey, response.data);
		}

		return response.data;
	}

	/**
	 * Récupère un groupe d'attributs spécifique (progressive disclosure)
	 *
	 * @param {string} blockName - Nom du bloc
	 * @param {string} group - Groupe d'attributs (basic, advanced, styling, animation, responsive)
	 * @returns {Promise<Object>} Attributs du groupe
	 */
	async getBlockAttributesByGroup(blockName, group) {
		// Vérifier le cache
		if (this.cache) {
			const cacheKey = RedisCache.blockAttributesKey(blockName, group);
			const cached = await this.cache.get(cacheKey);
			if (cached) {
				logger.debug('Block attributes retrieved from cache', { blockName, group });
				return cached;
			}
		}

		// Le nom du bloc est utilisé tel quel (ex: core/cover)
		const response = await this.client.get(
			`/claude-agent/v1/blocks/${blockName}/attributes/${group}`
		);

		// Mettre en cache
		if (this.cache) {
			const cacheKey = RedisCache.blockAttributesKey(blockName, group);
			await this.cache.set(cacheKey, response.data);
		}

		return response.data;
	}

	/**
	 * Récupère les presets/variations d'un bloc
	 *
	 * @param {string} blockName - Nom du bloc
	 * @returns {Promise<Object>} Presets du bloc
	 */
	async getBlockPresets(blockName) {
		const encodedName = encodeURIComponent(blockName);
		const response = await this.client.get(`/claude-agent/v1/blocks/${encodedName}/presets`);
		return response.data;
	}

	/**
	 * Récupère le design system du thème (global styles)
	 *
	 * @returns {Promise<Object>} Global styles (couleurs, polices, espacements)
	 */
	async getGlobalStyles() {
		// Vérifier le cache
		if (this.cache) {
			const cacheKey = RedisCache.globalStylesKey();
			const cached = await this.cache.get(cacheKey);
			if (cached) {
				logger.debug('Global styles retrieved from cache');
				return cached;
			}
		}

		const response = await this.client.get('/claude-agent/v1/theme/global-styles');

		// Mettre en cache
		if (this.cache) {
			const cacheKey = RedisCache.globalStylesKey();
			await this.cache.set(cacheKey, response.data);
		}

		return response.data;
	}

	/**
	 * Met à jour les global styles
	 *
	 * @param {Object} styles - Nouveaux styles
	 * @returns {Promise<Object>} Résultat de la mise à jour
	 */
	async updateGlobalStyles(styles) {
		const response = await this.client.post('/claude-agent/v1/theme/global-styles', { styles });
		return response.data;
	}

	/**
	 * Récupère tous les patterns disponibles
	 *
	 * @returns {Promise<Array>} Liste des patterns
	 */
	async getPatterns() {
		// Vérifier le cache
		if (this.cache) {
			const cacheKey = RedisCache.patternsKey();
			const cached = await this.cache.get(cacheKey);
			if (cached) {
				logger.debug('Patterns retrieved from cache');
				return cached;
			}
		}

		const response = await this.client.get('/claude-agent/v1/patterns');

		// Mettre en cache
		if (this.cache) {
			const cacheKey = RedisCache.patternsKey();
			await this.cache.set(cacheKey, response.data);
		}

		return response.data;
	}

	/**
	 * Récupère un pattern spécifique
	 *
	 * @param {string} patternName - Nom du pattern
	 * @returns {Promise<Object>} Pattern avec blocs parsés
	 */
	async getPattern(patternName) {
		const encodedName = encodeURIComponent(patternName);
		const response = await this.client.get(`/claude-agent/v1/patterns/${encodedName}`);
		return response.data;
	}

	/**
	 * Récupère tous les templates de site
	 *
	 * @returns {Promise<Object>} Templates groupés par catégorie
	 */
	async getTemplates() {
		const response = await this.client.get('/claude-agent/v1/templates');
		return response.data;
	}

	/**
	 * Crée un nouveau post
	 *
	 * @param {Object} postData - Données du post
	 * @param {string} postData.title - Titre
	 * @param {string} postData.content - Contenu HTML Gutenberg
	 * @param {string} postData.status - Statut (draft, publish, pending)
	 * @param {string} postData.post_type - Type de post
	 * @returns {Promise<Object>} Post créé
	 */
	async createPost(postData) {
		const response = await this.client.post('/claude-agent/v1/posts', postData);
		return response.data;
	}

	/**
	 * Met à jour un post existant
	 *
	 * @param {number} postId - ID du post
	 * @param {Object} postData - Données à mettre à jour
	 * @returns {Promise<Object>} Post mis à jour
	 */
	async updatePost(postId, postData) {
		const response = await this.client.put(`/claude-agent/v1/posts/${postId}`, postData);
		return response.data;
	}

	/**
	 * Récupère les informations système
	 *
	 * @returns {Promise<Object>} Informations système
	 */
	async getSystemInfo() {
		const response = await this.client.get('/claude-agent/v1/system/info');
		return response.data;
	}

	/**
	 * Récupère les capacités d'un plugin intégré
	 *
	 * @param {string} pluginName - Nom du plugin (woocommerce, yoast)
	 * @returns {Promise<Object|null>} Capacités ou null si non actif
	 */
	async getPluginCapabilities(pluginName) {
		try {
			const response = await this.client.get(`/claude-agent/v1/${pluginName}/capabilities`);
			return response.data;
		} catch (error) {
			// Plugin non actif
			return null;
		}
	}
}
