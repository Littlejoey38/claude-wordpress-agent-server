/**
 * Errors
 *
 * Classes d'erreurs personnalisées pour une gestion d'erreurs cohérente.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

/**
 * Classe de base pour les erreurs de l'application
 */
export class AppError extends Error {
	/**
	 * Constructeur
	 *
	 * @param {string} message - Message d'erreur
	 * @param {number} statusCode - Code HTTP (default: 500)
	 * @param {Object} metadata - Métadonnées additionnelles
	 */
	constructor(message, statusCode = 500, metadata = {}) {
		super(message);
		this.name = this.constructor.name;
		this.statusCode = statusCode;
		this.metadata = metadata;
		this.isOperational = true; // Erreur opérationnelle (attendue)

		// Capturer la stack trace
		Error.captureStackTrace(this, this.constructor);
	}

	/**
	 * Retourne l'erreur au format JSON
	 *
	 * @returns {Object} Erreur formatée
	 */
	toJSON() {
		return {
			error: this.name,
			message: this.message,
			statusCode: this.statusCode,
			metadata: this.metadata,
		};
	}
}

/**
 * Erreur de validation
 */
export class ValidationError extends AppError {
	/**
	 * Constructeur
	 *
	 * @param {string} message - Message d'erreur
	 * @param {Array} errors - Détails des erreurs de validation
	 */
	constructor(message, errors = []) {
		super(message, 400, { validation_errors: errors });
		this.errors = errors;
	}
}

/**
 * Erreur d'authentification
 */
export class AuthenticationError extends AppError {
	/**
	 * Constructeur
	 *
	 * @param {string} message - Message d'erreur
	 */
	constructor(message = 'Authentication failed') {
		super(message, 401);
	}
}

/**
 * Erreur d'autorisation
 */
export class AuthorizationError extends AppError {
	/**
	 * Constructeur
	 *
	 * @param {string} message - Message d'erreur
	 */
	constructor(message = 'Access denied') {
		super(message, 403);
	}
}

/**
 * Erreur de ressource non trouvée
 */
export class NotFoundError extends AppError {
	/**
	 * Constructeur
	 *
	 * @param {string} resource - Type de ressource
	 * @param {string|number} id - Identifiant de la ressource
	 */
	constructor(resource, id = null) {
		const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
		super(message, 404, { resource, id });
	}
}

/**
 * Erreur de conflit (ex: ressource déjà existante)
 */
export class ConflictError extends AppError {
	/**
	 * Constructeur
	 *
	 * @param {string} message - Message d'erreur
	 */
	constructor(message = 'Resource conflict') {
		super(message, 409);
	}
}

/**
 * Erreur de limite dépassée (rate limiting)
 */
export class RateLimitError extends AppError {
	/**
	 * Constructeur
	 *
	 * @param {string} message - Message d'erreur
	 * @param {number} retryAfter - Secondes avant de réessayer
	 */
	constructor(message = 'Rate limit exceeded', retryAfter = 60) {
		super(message, 429, { retry_after: retryAfter });
		this.retryAfter = retryAfter;
	}
}

/**
 * Erreur de service externe (WordPress, Anthropic, etc.)
 */
export class ExternalServiceError extends AppError {
	/**
	 * Constructeur
	 *
	 * @param {string} service - Nom du service
	 * @param {string} message - Message d'erreur
	 * @param {number} statusCode - Code HTTP
	 */
	constructor(service, message, statusCode = 502) {
		super(`${service} error: ${message}`, statusCode, { service });
		this.service = service;
	}
}

/**
 * Erreur de timeout
 */
export class TimeoutError extends AppError {
	/**
	 * Constructeur
	 *
	 * @param {string} operation - Opération qui a timeout
	 * @param {number} timeout - Durée du timeout en ms
	 */
	constructor(operation, timeout) {
		super(`Operation timeout: ${operation} (${timeout}ms)`, 504, { operation, timeout });
	}
}

/**
 * Gestionnaire d'erreurs global
 *
 * @param {Error} error - Erreur à gérer
 * @param {Object} logger - Logger Winston
 */
export function handleError(error, logger) {
	if (error.isOperational) {
		// Erreur opérationnelle : logger et continuer
		logger.error('Operational error', {
			name: error.name,
			message: error.message,
			statusCode: error.statusCode,
			metadata: error.metadata,
		});
	} else {
		// Erreur de programmation : logger et potentiellement arrêter
		logger.error('Programming error - critical', {
			name: error.name,
			message: error.message,
			stack: error.stack,
		});

		// En production, on pourrait décider de redémarrer le processus
		if (process.env.NODE_ENV === 'production') {
			// TODO: Implémenter une stratégie de graceful shutdown
			// process.exit(1);
		}
	}
}
