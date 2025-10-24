/**
 * Pending Requests Manager
 *
 * Gère les requêtes en attente de réponse de l'iframe WordPress.
 * Utilise un système de Promesses pour attendre les réponses asynchrones.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../utils/logger.js';

/**
 * Gestionnaire de requêtes en attente
 *
 * Permet de créer des Promesses qui seront résolues lorsque
 * l'iframe WordPress renvoie les données via HTTP callback.
 */
class PendingRequestsManager {
	constructor() {
		// Map: requestId -> { resolve, reject, timeout, timestamp }
		this.pendingRequests = new Map();

		// Configuration
		this.defaultTimeout = 10000; // 10 secondes par défaut
		this.maxRequests = 100; // Maximum de requêtes en attente

		// Cleanup des requêtes expirées toutes les 30 secondes
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, 30000);

		logger.info('PendingRequestsManager initialized');
	}

	/**
	 * Crée une requête en attente
	 *
	 * @param {string} requestId - ID unique de la requête
	 * @param {number} timeout - Timeout en ms (optionnel)
	 * @return {Promise} Promise qui sera résolue avec les données de l'iframe
	 */
	createPendingRequest(requestId, timeout = this.defaultTimeout) {
		// Vérifier qu'on n'a pas dépassé le maximum
		if (this.pendingRequests.size >= this.maxRequests) {
			logger.warn('Maximum pending requests reached, cleaning up oldest');
			this.cleanup();
		}

		// Créer la Promise
		return new Promise((resolve, reject) => {
			// Créer un timeout
			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(requestId);
				reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
			}, timeout);

			// Stocker la requête
			this.pendingRequests.set(requestId, {
				resolve,
				reject,
				timeout: timeoutId,
				timestamp: Date.now(),
			});

			logger.debug('Created pending request', { requestId, timeout });
		});
	}

	/**
	 * Résout une requête en attente avec les données reçues
	 *
	 * @param {string} requestId - ID de la requête
	 * @param {any} data - Données à retourner
	 * @return {boolean} True si la requête a été résolue, false si non trouvée
	 */
	resolvePendingRequest(requestId, data) {
		const pending = this.pendingRequests.get(requestId);

		if (!pending) {
			logger.warn('No pending request found for requestId', { requestId });
			return false;
		}

		// Nettoyer le timeout
		clearTimeout(pending.timeout);

		// Résoudre la Promise
		pending.resolve(data);

		// Supprimer de la Map
		this.pendingRequests.delete(requestId);

		logger.debug('Resolved pending request', { requestId });
		return true;
	}

	/**
	 * Rejette une requête en attente avec une erreur
	 *
	 * @param {string} requestId - ID de la requête
	 * @param {Error} error - Erreur
	 * @return {boolean} True si la requête a été rejetée, false si non trouvée
	 */
	rejectPendingRequest(requestId, error) {
		const pending = this.pendingRequests.get(requestId);

		if (!pending) {
			logger.warn('No pending request found for requestId', { requestId });
			return false;
		}

		// Nettoyer le timeout
		clearTimeout(pending.timeout);

		// Rejeter la Promise
		pending.reject(error);

		// Supprimer de la Map
		this.pendingRequests.delete(requestId);

		logger.debug('Rejected pending request', { requestId, error: error.message });
		return true;
	}

	/**
	 * Nettoie les requêtes expirées ou trop anciennes
	 */
	cleanup() {
		const now = Date.now();
		const maxAge = 60000; // 1 minute
		let cleaned = 0;

		for (const [requestId, pending] of this.pendingRequests.entries()) {
			if (now - pending.timestamp > maxAge) {
				clearTimeout(pending.timeout);
				this.pendingRequests.delete(requestId);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			logger.info('Cleaned up old pending requests', { count: cleaned });
		}
	}

	/**
	 * Obtient le nombre de requêtes en attente
	 *
	 * @return {number} Nombre de requêtes en attente
	 */
	getPendingCount() {
		return this.pendingRequests.size;
	}

	/**
	 * Détruit le gestionnaire et nettoie toutes les ressources
	 */
	destroy() {
		// Arrêter le cleanup interval
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}

		// Rejeter toutes les requêtes en attente
		for (const [requestId, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error('PendingRequestsManager destroyed'));
		}

		this.pendingRequests.clear();
		logger.info('PendingRequestsManager destroyed');
	}
}

// Singleton instance
let instance = null;

/**
 * Obtient l'instance singleton du gestionnaire
 *
 * @return {PendingRequestsManager} Instance du gestionnaire
 */
export function getPendingRequestsManager() {
	if (!instance) {
		instance = new PendingRequestsManager();
	}
	return instance;
}

export { PendingRequestsManager };
