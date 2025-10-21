/**
 * Redis Cache
 *
 * Gère le cache Redis pour les schémas de blocs, patterns, etc.
 * Réduit les appels à l'API WordPress et améliore les performances.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import { createClient } from 'redis';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * Classe RedisCache
 */
export class RedisCache {
	/**
	 * Constructeur
	 *
	 * @param {Object} config - Configuration Redis
	 * @param {string} config.url - URL de connexion Redis
	 * @param {boolean} config.enabled - Activer/désactiver le cache
	 * @param {number} config.ttl - Durée de vie par défaut (secondes)
	 */
	constructor(config) {
		this.config = config;
		this.client = null;
		this.enabled = config.enabled !== false;
		this.defaultTTL = config.ttl || 3600; // 1 heure par défaut
	}

	/**
	 * Initialise la connexion Redis
	 *
	 * @returns {Promise<void>}
	 */
	async initialize() {
		if (!this.enabled) {
			logger.info('Redis cache is disabled');
			return;
		}

		try {
			logger.info('Initializing Redis cache', { url: this.config.url });

			// Créer le client Redis
			this.client = createClient({
				url: this.config.url,
			});

			// Gérer les erreurs
			this.client.on('error', (error) => {
				logger.error('Redis client error', { error: error.message });
			});

			// Gérer la reconnexion
			this.client.on('reconnecting', () => {
				logger.info('Redis client reconnecting...');
			});

			// Connecter
			await this.client.connect();

			logger.info('Redis cache initialized successfully');
		} catch (error) {
			logger.error('Failed to initialize Redis cache', { error: error.message });
			// Ne pas throw, désactiver le cache en mode graceful degradation
			this.enabled = false;
		}
	}

	/**
	 * Vérifie si le cache est disponible
	 *
	 * @returns {boolean} True si disponible
	 */
	isAvailable() {
		return this.enabled && this.client && this.client.isOpen;
	}

	/**
	 * Récupère une valeur du cache
	 *
	 * @param {string} key - Clé de cache
	 * @returns {Promise<any|null>} Valeur ou null si non trouvée
	 */
	async get(key) {
		if (!this.isAvailable()) {
			return null;
		}

		try {
			const value = await this.client.get(key);

			if (value) {
				logger.debug('Cache hit', { key });
				return JSON.parse(value);
			}

			logger.debug('Cache miss', { key });
			return null;
		} catch (error) {
			logger.error('Redis get error', { key, error: error.message });
			return null;
		}
	}

	/**
	 * Stocke une valeur dans le cache
	 *
	 * @param {string} key - Clé de cache
	 * @param {any} value - Valeur à stocker
	 * @param {number} ttl - Durée de vie en secondes (optionnel)
	 * @returns {Promise<boolean>} Succès
	 */
	async set(key, value, ttl = this.defaultTTL) {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const serialized = JSON.stringify(value);
			await this.client.setEx(key, ttl, serialized);

			logger.debug('Cache set', { key, ttl });
			return true;
		} catch (error) {
			logger.error('Redis set error', { key, error: error.message });
			return false;
		}
	}

	/**
	 * Supprime une clé du cache
	 *
	 * @param {string} key - Clé à supprimer
	 * @returns {Promise<boolean>} Succès
	 */
	async del(key) {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			await this.client.del(key);
			logger.debug('Cache delete', { key });
			return true;
		} catch (error) {
			logger.error('Redis del error', { key, error: error.message });
			return false;
		}
	}

	/**
	 * Supprime toutes les clés correspondant à un pattern
	 *
	 * @param {string} pattern - Pattern (ex: 'block:*')
	 * @returns {Promise<number>} Nombre de clés supprimées
	 */
	async delPattern(pattern) {
		if (!this.isAvailable()) {
			return 0;
		}

		try {
			const keys = await this.client.keys(pattern);

			if (keys.length === 0) {
				return 0;
			}

			await this.client.del(keys);
			logger.info('Cache pattern delete', { pattern, count: keys.length });
			return keys.length;
		} catch (error) {
			logger.error('Redis delPattern error', { pattern, error: error.message });
			return 0;
		}
	}

	/**
	 * Vide tout le cache
	 *
	 * @returns {Promise<boolean>} Succès
	 */
	async flush() {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			await this.client.flushDb();
			logger.info('Cache flushed');
			return true;
		} catch (error) {
			logger.error('Redis flush error', { error: error.message });
			return false;
		}
	}

	/**
	 * Génère une clé de cache pour un schéma de bloc
	 *
	 * @param {string} blockName - Nom du bloc
	 * @returns {string} Clé de cache
	 */
	static blockSchemaKey(blockName) {
		return `block:schema:${blockName}`;
	}

	/**
	 * Génère une clé de cache pour les attributs d'un groupe
	 *
	 * @param {string} blockName - Nom du bloc
	 * @param {string} group - Nom du groupe
	 * @returns {string} Clé de cache
	 */
	static blockAttributesKey(blockName, group) {
		return `block:attributes:${blockName}:${group}`;
	}

	/**
	 * Génère une clé de cache pour les global styles
	 *
	 * @returns {string} Clé de cache
	 */
	static globalStylesKey() {
		return 'theme:global-styles';
	}

	/**
	 * Génère une clé de cache pour les patterns
	 *
	 * @returns {string} Clé de cache
	 */
	static patternsKey() {
		return 'patterns:all';
	}

	/**
	 * Ferme la connexion Redis
	 *
	 * @returns {Promise<void>}
	 */
	async close() {
		if (!this.client) {
			return;
		}

		try {
			logger.info('Closing Redis connection');
			await this.client.quit();
			logger.info('Redis connection closed');
		} catch (error) {
			logger.error('Error closing Redis connection', { error: error.message });
		}
	}
}
