/**
 * Tools Adapter pour Claude Agent SDK
 *
 * Convertit nos tools WordPress/Gutenberg au format MCP du SDK
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Convertit un input_schema JSON Schema en Zod schema
 *
 * Le SDK utilise Zod pour la validation des inputs
 *
 * @param {Object} jsonSchema - JSON Schema (format Anthropic)
 * @returns {Object} Zod schema
 */
function jsonSchemaToZod(jsonSchema) {
	if (!jsonSchema || !jsonSchema.properties) {
		return z.object({});
	}

	const shape = {};

	for (const [key, prop] of Object.entries(jsonSchema.properties)) {
		let zodType;

		switch (prop.type) {
			case 'string':
				zodType = z.string();
				if (prop.description) {
					zodType = zodType.describe(prop.description);
				}
				if (prop.enum) {
					zodType = z.enum(prop.enum);
				}
				break;

			case 'number':
			case 'integer':
				zodType = z.number();
				if (prop.description) {
					zodType = zodType.describe(prop.description);
				}
				break;

			case 'boolean':
				zodType = z.boolean();
				if (prop.description) {
					zodType = zodType.describe(prop.description);
				}
				break;

			case 'object':
				zodType = z.record(z.any());
				if (prop.description) {
					zodType = zodType.describe(prop.description);
				}
				break;

			case 'array':
				zodType = z.array(z.any());
				if (prop.description) {
					zodType = zodType.describe(prop.description);
				}
				break;

			default:
				zodType = z.any();
		}

		// Rendre optionnel si ce n'est pas requis
		if (!jsonSchema.required || !jsonSchema.required.includes(key)) {
			zodType = zodType.optional();
		}

		shape[key] = zodType;
	}

	return z.object(shape);
}

/**
 * Convertit nos tools personnalisés au format SDK MCP
 *
 * @param {Array} tools - Nos tools (format {name, description, input_schema, handler})
 * @returns {Array} Tools au format SDK MCP
 */
export function convertToolsToMCP(tools) {
	return tools.map((t) => {
		// Convertir le JSON Schema en Zod Schema
		const zodSchema = jsonSchemaToZod(t.input_schema);

		// Créer le tool SDK
		return tool(
			t.name,
			t.description,
			zodSchema.shape, // Le SDK attend un ZodRawShape
			async (args, extra) => {
				// Exécuter notre handler
				const result = await t.handler(args);

				// Le SDK attend un CallToolResult avec `content` et `isError`
				return {
					content: [{
						type: 'text',
						text: JSON.stringify(result),
					}],
					isError: false,
				};
			}
		);
	});
}

/**
 * Crée un MCP Server avec nos tools WordPress/Gutenberg
 *
 * @param {Array} tools - Nos tools
 * @returns {Object} MCP Server config pour le SDK
 */
export function createWordPressMCPServer(tools) {
	const mcpTools = convertToolsToMCP(tools);

	return createSdkMcpServer({
		name: 'wordpress-agent',
		version: '1.0.0',
		tools: mcpTools,
	});
}
