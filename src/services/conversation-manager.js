/**
 * Conversation Manager
 *
 * Gère la persistance des conversations entre l'utilisateur et l'agent.
 * Pour l'instant stockage en mémoire, mais structure prête pour migration vers DB.
 *
 * @module ConversationManager
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * Gestionnaire de conversations
 *
 * Stocke l'historique des conversations pour permettre la mémoire entre les requêtes.
 * Chaque conversation est identifiée par un ID unique.
 */
class ConversationManager {
	constructor() {
		// Stockage en mémoire : Map<conversation_id, conversation_data>
		// TODO: Migrer vers PostgreSQL pour persistance réelle
		this.conversations = new Map();

		// Nettoyage automatique des anciennes conversations (après 24h d'inactivité)
		this.startCleanupInterval();
	}

	/**
	 * Crée une nouvelle conversation
	 *
	 * @param {Object} metadata - Métadonnées de la conversation (user_id, site_id, etc.)
	 * @returns {string} conversation_id
	 */
	createConversation(metadata = {}) {
		const conversation_id = uuidv4();

		this.conversations.set(conversation_id, {
			id: conversation_id,
			created_at: new Date(),
			updated_at: new Date(),
			metadata: metadata,
			history: [], // Format Anthropic: [{ role: 'user'|'assistant', content: [...] }]
		});

		logger.info('New conversation created', {
			conversation_id,
			metadata
		});

		return conversation_id;
	}

	/**
	 * Récupère une conversation existante
	 *
	 * @param {string} conversation_id - ID de la conversation
	 * @returns {Object|null} Conversation ou null si non trouvée
	 */
	getConversation(conversation_id) {
		const conversation = this.conversations.get(conversation_id);

		if (!conversation) {
			logger.warn('Conversation not found', { conversation_id });
			return null;
		}

		// Mettre à jour last_accessed
		conversation.updated_at = new Date();

		return conversation;
	}

	/**
	 * Récupère l'historique d'une conversation
	 *
	 * @param {string} conversation_id - ID de la conversation
	 * @returns {Array} Historique au format Anthropic ou tableau vide si conversation n'existe pas
	 */
	getHistory(conversation_id) {
		const conversation = this.getConversation(conversation_id);

		if (!conversation) {
			return [];
		}

		logger.debug('Conversation history retrieved', {
			conversation_id,
			message_count: conversation.history.length
		});

		return [...conversation.history]; // Copie pour éviter les mutations
	}

	/**
	 * Ajoute un message à l'historique d'une conversation
	 *
	 * @param {string} conversation_id - ID de la conversation
	 * @param {Object} message - Message au format Anthropic { role, content }
	 */
	addMessage(conversation_id, message) {
		const conversation = this.getConversation(conversation_id);

		if (!conversation) {
			throw new Error(`Conversation ${conversation_id} not found`);
		}

		conversation.history.push(message);
		conversation.updated_at = new Date();

		logger.debug('Message added to conversation', {
			conversation_id,
			role: message.role,
			total_messages: conversation.history.length
		});
	}

	/**
	 * Ajoute plusieurs messages à l'historique
	 *
	 * @param {string} conversation_id - ID de la conversation
	 * @param {Array} messages - Tableau de messages
	 */
	addMessages(conversation_id, messages) {
		const conversation = this.getConversation(conversation_id);

		if (!conversation) {
			throw new Error(`Conversation ${conversation_id} not found`);
		}

		conversation.history.push(...messages);
		conversation.updated_at = new Date();

		logger.debug('Messages added to conversation', {
			conversation_id,
			messages_added: messages.length,
			total_messages: conversation.history.length
		});
	}

	/**
	 * Met à jour les métadonnées d'une conversation
	 *
	 * @param {string} conversation_id - ID de la conversation
	 * @param {Object} metadata - Nouvelles métadonnées à merger
	 */
	updateMetadata(conversation_id, metadata) {
		const conversation = this.getConversation(conversation_id);

		if (!conversation) {
			throw new Error(`Conversation ${conversation_id} not found`);
		}

		conversation.metadata = {
			...conversation.metadata,
			...metadata,
		};

		conversation.updated_at = new Date();

		logger.debug('Conversation metadata updated', {
			conversation_id,
			metadata
		});
	}

	/**
	 * Supprime une conversation
	 *
	 * @param {string} conversation_id - ID de la conversation
	 */
	deleteConversation(conversation_id) {
		const existed = this.conversations.delete(conversation_id);

		if (existed) {
			logger.info('Conversation deleted', { conversation_id });
		}

		return existed;
	}

	/**
	 * Efface l'historique d'une conversation (garde les métadonnées)
	 *
	 * @param {string} conversation_id - ID de la conversation
	 */
	clearHistory(conversation_id) {
		const conversation = this.getConversation(conversation_id);

		if (!conversation) {
			throw new Error(`Conversation ${conversation_id} not found`);
		}

		const previous_count = conversation.history.length;
		conversation.history = [];
		conversation.updated_at = new Date();

		logger.info('Conversation history cleared', {
			conversation_id,
			messages_cleared: previous_count
		});
	}

	/**
	 * Récupère toutes les conversations (utile pour debug)
	 *
	 * @returns {Array} Liste des conversations avec stats
	 */
	getAllConversations() {
		return Array.from(this.conversations.values()).map(conv => ({
			id: conv.id,
			created_at: conv.created_at,
			updated_at: conv.updated_at,
			metadata: conv.metadata,
			message_count: conv.history.length,
		}));
	}

	/**
	 * Nettoyage automatique des conversations inactives (>24h)
	 *
	 * En production, ce serait géré par la DB avec des TTL ou des jobs cron
	 */
	startCleanupInterval() {
		const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 heure
		const MAX_INACTIVE_TIME = 24 * 60 * 60 * 1000; // 24 heures

		setInterval(() => {
			const now = new Date();
			let cleaned = 0;

			for (const [id, conv] of this.conversations.entries()) {
				const inactive_time = now - conv.updated_at;

				if (inactive_time > MAX_INACTIVE_TIME) {
					this.conversations.delete(id);
					cleaned++;
				}
			}

			if (cleaned > 0) {
				logger.info('Inactive conversations cleaned up', {
					count: cleaned,
					remaining: this.conversations.size
				});
			}
		}, CLEANUP_INTERVAL);
	}

	/**
	 * Retourne les stats globales du manager
	 *
	 * @returns {Object} Statistiques
	 */
	getStats() {
		let total_messages = 0;

		for (const conv of this.conversations.values()) {
			total_messages += conv.history.length;
		}

		return {
			total_conversations: this.conversations.size,
			total_messages: total_messages,
			average_messages_per_conversation: this.conversations.size > 0
				? (total_messages / this.conversations.size).toFixed(2)
				: 0,
		};
	}
}

// Singleton instance
let instance = null;

/**
 * Récupère l'instance singleton du ConversationManager
 *
 * @returns {ConversationManager}
 */
function getConversationManager() {
	if (!instance) {
		instance = new ConversationManager();
		logger.info('ConversationManager initialized');
	}
	return instance;
}

export {
	ConversationManager,
	getConversationManager,
};
