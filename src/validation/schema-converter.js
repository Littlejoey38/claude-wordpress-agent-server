/**
 * Schema Converter
 *
 * Convertit les schémas de blocs WordPress en formats optimisés pour Claude.
 * Gère la progressive disclosure et la documentation des attributs.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../utils/logger.js';

/**
 * Classe SchemaConverter
 */
export class SchemaConverter {
	/**
	 * Convertit un schéma de bloc en format optimisé pour Claude
	 *
	 * @param {Object} blockSchema - Schéma de bloc WordPress
	 * @returns {Object} Schéma optimisé pour Claude
	 */
	static convertForAgent(blockSchema) {
		const converted = {
			name: blockSchema.name,
			title: blockSchema.title,
			description: blockSchema.description || '',
			category: blockSchema.category || 'common',
			icon: blockSchema.icon || '',
			supports: blockSchema.supports || {},
			attributes: {},
			attribute_count: 0,
		};

		// Convertir chaque attribut
		for (const [attrName, attrDef] of Object.entries(blockSchema.attributes || {})) {
			converted.attributes[attrName] = this.convertAttribute(attrName, attrDef);
			converted.attribute_count++;
		}

		return converted;
	}

	/**
	 * Convertit un attribut de bloc
	 *
	 * @param {string} name - Nom de l'attribut
	 * @param {Object} definition - Définition de l'attribut
	 * @returns {Object} Attribut converti
	 */
	static convertAttribute(name, definition) {
		const converted = {
			name,
			type: definition.type || 'string',
			default: definition.default !== undefined ? definition.default : null,
			description: definition.description || '',
		};

		// Ajouter enum si disponible
		if (definition.enum && Array.isArray(definition.enum)) {
			converted.possible_values = definition.enum;
		}

		// Ajouter source (comment l'attribut est stocké)
		if (definition.source) {
			converted.source = definition.source;
		}

		// Ajouter selector (pour les attributs avec source HTML)
		if (definition.selector) {
			converted.selector = definition.selector;
		}

		return converted;
	}

	/**
	 * Détermine si un bloc nécessite la progressive disclosure
	 *
	 * @param {Object} blockSchema - Schéma de bloc
	 * @returns {boolean} True si > 50 attributs
	 */
	static needsProgressiveDisclosure(blockSchema) {
		const attrCount = Object.keys(blockSchema.attributes || {}).length;
		return attrCount > 50;
	}

	/**
	 * Catégorise les attributs d'un bloc pour progressive disclosure
	 *
	 * Note: La logique de catégorisation est déjà dans le plugin WordPress
	 * (class-block-schema-manager.php). Cette fonction est pour usage local.
	 *
	 * @param {Object} blockSchema - Schéma de bloc
	 * @returns {Object} Attributs groupés par catégorie
	 */
	static categorizeAttributes(blockSchema) {
		const groups = {
			basic: [],
			advanced: [],
			styling: [],
			animation: [],
			responsive: [],
		};

		// Mots-clés pour détecter les groupes
		const keywords = {
			basic: ['content', 'title', 'text', 'url', 'src', 'alt', 'href'],
			styling: ['color', 'background', 'border', 'padding', 'margin', 'font', 'size'],
			animation: ['animation', 'transition', 'hover', 'effect', 'parallax'],
			responsive: ['mobile', 'tablet', 'desktop', 'breakpoint'],
		};

		for (const [attrName, attrDef] of Object.entries(blockSchema.attributes || {})) {
			let assigned = false;

			// Chercher dans quel groupe placer l'attribut
			for (const [group, groupKeywords] of Object.entries(keywords)) {
				if (groupKeywords.some((keyword) => attrName.toLowerCase().includes(keyword))) {
					groups[group].push(attrName);
					assigned = true;
					break;
				}
			}

			// Si non assigné, mettre dans advanced
			if (!assigned) {
				groups.advanced.push(attrName);
			}
		}

		return groups;
	}

	/**
	 * Génère une documentation lisible pour Claude
	 *
	 * @param {Object} blockSchema - Schéma de bloc
	 * @returns {string} Documentation formatée en markdown
	 */
	static generateDocumentation(blockSchema) {
		let doc = `# ${blockSchema.title || blockSchema.name}\n\n`;

		if (blockSchema.description) {
			doc += `${blockSchema.description}\n\n`;
		}

		doc += `**Category:** ${blockSchema.category || 'common'}\n`;
		doc += `**Attributes:** ${Object.keys(blockSchema.attributes || {}).length}\n\n`;

		// Attributs
		doc += `## Attributes\n\n`;

		for (const [attrName, attrDef] of Object.entries(blockSchema.attributes || {})) {
			doc += `### ${attrName}\n\n`;
			doc += `- **Type:** ${attrDef.type || 'string'}\n`;

			if (attrDef.default !== undefined) {
				doc += `- **Default:** ${JSON.stringify(attrDef.default)}\n`;
			}

			if (attrDef.enum) {
				doc += `- **Possible values:** ${attrDef.enum.join(', ')}\n`;
			}

			if (attrDef.description) {
				doc += `- **Description:** ${attrDef.description}\n`;
			}

			doc += '\n';
		}

		return doc;
	}

	/**
	 * Crée un résumé condensé pour les listes de blocs
	 *
	 * @param {Object} blockSchema - Schéma de bloc
	 * @returns {Object} Résumé du bloc
	 */
	static createSummary(blockSchema) {
		return {
			name: blockSchema.name,
			title: blockSchema.title,
			category: blockSchema.category || 'common',
			attribute_count: Object.keys(blockSchema.attributes || {}).length,
			uses_progressive: this.needsProgressiveDisclosure(blockSchema),
			description: blockSchema.description?.substring(0, 150) || '',
		};
	}

	/**
	 * Extrait uniquement les attributs essentiels d'un bloc
	 *
	 * @param {Object} blockSchema - Schéma de bloc
	 * @returns {Object} Attributs essentiels uniquement
	 */
	static extractEssentialAttributes(blockSchema) {
		const essential = {};

		// Mots-clés qui indiquent un attribut essentiel
		const essentialKeywords = ['content', 'title', 'text', 'url', 'src', 'href', 'alt'];

		for (const [attrName, attrDef] of Object.entries(blockSchema.attributes || {})) {
			const isEssential = essentialKeywords.some((keyword) =>
				attrName.toLowerCase().includes(keyword)
			);

			if (isEssential) {
				essential[attrName] = attrDef;
			}
		}

		return essential;
	}
}
