/**
 * Block Validator
 *
 * Valide les attributs de blocs Gutenberg avec Ajv (JSON Schema validator).
 * Utilise additionalProperties: false pour détecter attributs invalides.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * Classe BlockValidator
 */
export class BlockValidator {
	/**
	 * Constructeur
	 */
	constructor() {
		// Initialiser Ajv avec options strictes
		this.ajv = new Ajv({
			allErrors: true, // Retourner toutes les erreurs, pas seulement la première
			strict: true,
			validateFormats: true,
		});

		// Ajouter les formats standard (email, uri, date-time, etc.)
		addFormats(this.ajv);

		// Cache des schémas compilés
		this.compiledSchemas = new Map();

		logger.info('Block Validator initialized');
	}

	/**
	 * Convertit un schéma de bloc WordPress en JSON Schema Ajv
	 *
	 * @param {Object} blockSchema - Schéma de bloc WordPress
	 * @returns {Object} JSON Schema pour Ajv
	 */
	convertToJSONSchema(blockSchema) {
		const properties = {};
		const required = [];

		// Parcourir les attributs du bloc
		for (const [attrName, attrDef] of Object.entries(blockSchema.attributes || {})) {
			// Déterminer le type JSON Schema
			let type = 'string'; // Par défaut

			if (attrDef.type === 'boolean') {
				type = 'boolean';
			} else if (attrDef.type === 'number' || attrDef.type === 'integer') {
				type = 'number';
			} else if (attrDef.type === 'array') {
				type = 'array';
			} else if (attrDef.type === 'object') {
				type = 'object';
			}

			const propertySchema = { type };

			// Ajouter enum si des valeurs possibles sont définies
			if (attrDef.enum && Array.isArray(attrDef.enum)) {
				propertySchema.enum = attrDef.enum;
			}

			// Ajouter la propriété
			properties[attrName] = propertySchema;

			// Marquer comme requis si défini dans le schéma
			if (attrDef.required) {
				required.push(attrName);
			}
		}

		// Créer le schéma JSON complet
		const jsonSchema = {
			type: 'object',
			properties,
			required: required.length > 0 ? required : undefined,
			additionalProperties: false, // CRITIQUE : rejeter attributs inconnus
		};

		return jsonSchema;
	}

	/**
	 * Compile et cache un schéma de bloc
	 *
	 * @param {string} blockName - Nom du bloc
	 * @param {Object} blockSchema - Schéma de bloc WordPress
	 * @returns {Function} Validateur compilé
	 */
	compileSchema(blockName, blockSchema) {
		// Vérifier si déjà compilé
		if (this.compiledSchemas.has(blockName)) {
			logger.debug('Using cached schema', { block: blockName });
			return this.compiledSchemas.get(blockName);
		}

		try {
			// Convertir en JSON Schema
			const jsonSchema = this.convertToJSONSchema(blockSchema);

			// Compiler avec Ajv
			const validate = this.ajv.compile(jsonSchema);

			// Mettre en cache
			this.compiledSchemas.set(blockName, validate);

			logger.info('Schema compiled and cached', { block: blockName });
			return validate;
		} catch (error) {
			logger.error('Failed to compile schema', { block: blockName, error: error.message });
			throw new AppError(`Schema compilation failed for ${blockName}: ${error.message}`, 500);
		}
	}

	/**
	 * Valide les attributs d'un bloc
	 *
	 * @param {string} blockName - Nom du bloc
	 * @param {Object} attributes - Attributs à valider
	 * @param {Object} blockSchema - Schéma de bloc WordPress
	 * @returns {Object} Résultat de validation { valid: boolean, errors: Array }
	 */
	validate(blockName, attributes, blockSchema) {
		try {
			logger.debug('Validating block attributes', { block: blockName });

			// Compiler le schéma (ou récupérer du cache)
			const validate = this.compileSchema(blockName, blockSchema);

			// Valider
			const valid = validate(attributes);

			if (!valid) {
				const errors = validate.errors.map((err) => ({
					path: err.instancePath || '/',
					message: err.message,
					keyword: err.keyword,
					params: err.params,
				}));

				logger.warn('Block validation failed', {
					block: blockName,
					errors,
				});

				return {
					valid: false,
					errors,
				};
			}

			logger.debug('Block validation successful', { block: blockName });
			return {
				valid: true,
				errors: [],
			};
		} catch (error) {
			logger.error('Validation error', { block: blockName, error: error.message });
			throw error;
		}
	}

	/**
	 * Génère un message d'erreur lisible pour Claude
	 *
	 * @param {Array} errors - Erreurs de validation
	 * @returns {string} Message formaté
	 */
	formatErrorsForAgent(errors) {
		if (errors.length === 0) {
			return 'No validation errors';
		}

		const messages = errors.map((err) => {
			if (err.keyword === 'additionalProperties') {
				return `Unknown attribute: "${err.params.additionalProperty}"`;
			}
			if (err.keyword === 'enum') {
				return `Invalid value for "${err.path}". Allowed: ${err.params.allowedValues.join(', ')}`;
			}
			if (err.keyword === 'type') {
				return `Invalid type for "${err.path}". Expected: ${err.params.type}`;
			}
			return `${err.path}: ${err.message}`;
		});

		return `Validation errors:\n${messages.join('\n')}`;
	}

	/**
	 * Nettoie le cache des schémas compilés
	 *
	 * @param {string} blockName - Nom du bloc (optionnel, sinon tout)
	 */
	clearCache(blockName = null) {
		if (blockName) {
			this.compiledSchemas.delete(blockName);
			logger.info('Cleared schema cache', { block: blockName });
		} else {
			this.compiledSchemas.clear();
			logger.info('Cleared all schema cache');
		}
	}
}
