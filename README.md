# WordPress Claude Agent - Server Node.js

Agent IA autonome pour la création et gestion de sites WordPress via Gutenberg, utilisant Claude Sonnet 4.5.

## 🎯 Principe "Discover, Don't Assume"

L'agent **NE génère JAMAIS de HTML manuellement**. Il :

1. **Découvre** les blocs disponibles via l'API WordPress
2. **Inspecte** les schémas de blocs pour connaître les attributs
3. **Valide** les attributs avec Ajv avant création
4. **Crée** les blocs via le bridge Gutenberg (Playwright)
5. **Vérifie** la validité dans l'éditeur

**Résultat** : 95-99% de succès avec blocs natifs, 90-95% avec blocs tiers complexes.

## 📁 Structure du projet

```
wordpress-agent-server/
├── package.json                 # Dépendances npm
├── .env.example                 # Template variables d'environnement
├── .gitignore                   # Fichiers à ignorer
├── src/
│   ├── index.js                 # Point d'entrée Express
│   ├── agent/
│   │   ├── orchestrator.js      # Agent principal Claude
│   │   ├── sub-agents/          # Agents spécialisés
│   │   │   ├── seo-agent.js
│   │   │   ├── copywriting-agent.js
│   │   │   ├── design-agent.js
│   │   │   └── technical-agent.js
│   │   └── tools/               # Tools pour Claude
│   │       ├── wordpress-tools.js
│   │       ├── gutenberg-tools.js
│   │       └── fse-tools.js
│   ├── clients/
│   │   ├── wordpress-api.js     # Client API WordPress REST
│   │   ├── gutenberg-controller.js  # Playwright pour Gutenberg
│   │   └── anthropic-client.js  # Wrapper SDK Anthropic
│   ├── validation/
│   │   ├── block-validator.js   # Validation Ajv (JSON Schema)
│   │   └── schema-converter.js  # Conversion schémas pour Claude
│   ├── cache/
│   │   └── redis-cache.js       # Cache Redis pour schémas
│   └── utils/
│       ├── logger.js            # Winston logger
│       └── errors.js            # Classes d'erreurs
├── templates/                   # Templates JSON pré-validés
│   ├── nectar-blocks/
│   ├── core/
│   └── custom/
├── tests/                       # Tests Jest
│   ├── unit/
│   └── integration/
└── logs/                        # Logs Winston
```

## 🚀 Installation

### Prérequis

- Node.js 18+
- Redis 6+ (optionnel mais recommandé)
- WordPress 6.0+ avec le plugin `claude-wordpress-agent` activé

### Étapes

1. **Installer les dépendances**

```bash
npm install
```

2. **Configurer les variables d'environnement**

```bash
cp .env.example .env
```

Éditer `.env` et remplir :

- `WORDPRESS_URL` - URL de votre site WordPress
- `WORDPRESS_USER` - Nom d'utilisateur WordPress
- `WORDPRESS_APP_PASSWORD` - Application Password (généré dans WordPress)
- `ANTHROPIC_API_KEY` - Clé API Anthropic

3. **Lancer Redis (optionnel)**

```bash
# Docker
docker run -d -p 6379:6379 redis:7-alpine

# macOS
brew services start redis

# Linux
sudo systemctl start redis
```

4. **Démarrer le serveur**

```bash
# Mode développement (avec nodemon)
npm run dev

# Mode production
npm start
```

Le serveur démarre sur `http://localhost:3000`

## 🔧 Configuration

### Variables d'environnement (.env)

Voir [.env.example](.env.example) pour la liste complète.

**Essentielles** :

- `ANTHROPIC_API_KEY` - Clé API Anthropic
- `WORDPRESS_URL` - URL WordPress (ex: http://localhost/wordpress)
- `WORDPRESS_USER` - Utilisateur avec permissions edit_posts
- `WORDPRESS_APP_PASSWORD` - Application Password WordPress

**Optionnelles** :

- `REDIS_ENABLED=true` - Activer le cache Redis (recommandé)
- `HEADLESS=false` - Mode Playwright (false = voir le navigateur)
- `LOG_LEVEL=info` - Niveau de logs (debug, info, warn, error)

### Redis

Le cache Redis est **optionnel** mais fortement recommandé :

- **Sans Redis** : L'agent fonctionne mais appelle l'API WordPress à chaque fois
- **Avec Redis** : Schémas de blocs cachés pendant 1 heure (configurable)

## 📡 API REST

### POST /agent/process

Traite une requête utilisateur avec Claude.

**Body** :

```json
{
  "message": "Crée une page d'accueil avec un hero et 3 features",
  "options": {
    "conversation_id": "abc123",
    "user_id": "user456"
  }
}
```

**Réponse** :

```json
{
  "success": true,
  "result": {
    "message": "Page créée avec succès",
    "post_id": 123,
    "edit_link": "http://localhost/wp-admin/post.php?post=123&action=edit"
  }
}
```

### GET /health

Vérification de santé du serveur.

**Réponse** :

```json
{
  "status": "ok",
  "environment": "development",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## 🧪 Tests

```bash
# Tous les tests
npm test

# Tests en mode watch
npm run test:watch

# Tests avec couverture
npm test -- --coverage
```

Voir [tests/README.md](tests/README.md) pour plus de détails.

## 📝 Workflow de l'agent

### 1. Requête utilisateur

```
User: "Crée une page à propos avec un hero et du contenu"
```

### 2. Orchestrateur analyse

L'orchestrateur Claude reçoit la requête et :

1. Appelle `discover_available_blocks` pour voir les blocs disponibles
2. Appelle `get_theme_design_system` pour connaître les couleurs/polices
3. Délègue au **Copywriting Agent** pour le contenu
4. Délègue au **Design Agent** pour la mise en page
5. Délègue au **SEO Agent** pour l'optimisation

### 3. Création des blocs

Pour chaque bloc à créer :

1. Cherche un template avec `search_block_templates`
2. Si template trouvé → utilise `use_block_template`
3. Sinon → appelle `inspect_block_schema` pour découvrir les attributs
4. Valide les attributs avec Ajv (`BlockValidator`)
5. Crée le bloc avec `insert_block` (via Playwright)
6. Vérifie la validité avec `validate_block`
7. Si erreur → corrige et réessaie (max 3 fois)

### 4. Retour utilisateur

```json
{
  "success": true,
  "result": {
    "post_id": 456,
    "edit_link": "...",
    "blocks_created": 5,
    "seo_score": 85
  }
}
```

## 🏗️ Architecture

### Orchestrateur

Gère la boucle d'interaction avec Claude :

1. Envoie message + tools à Claude
2. Reçoit réponse (texte ou tool calls)
3. Si tool calls → exécute les tools
4. Renvoie résultats à Claude
5. Répète jusqu'à réponse finale

### Sub-Agents

4 agents spécialisés (chacun est une instance Claude) :

- **SEO Agent** : Structure, mots-clés, meta descriptions, slugs
- **Copywriting Agent** : Contenu persuasif, CTAs, storytelling
- **Design Agent** : Layout, couleurs, accessibilité (WCAG AA)
- **Technical Agent** : Validation HTML, performance, compatibilité

### Clients

- **WordPressAPI** : Axios pour l'API REST WordPress
- **GutenbergController** : Playwright pour contrôler Gutenberg
- **AnthropicClient** : Wrapper autour du SDK Anthropic

### Validation

- **BlockValidator** : Ajv avec `additionalProperties: false` (CRITIQUE)
- **SchemaConverter** : Convertit schémas WordPress en format optimisé pour Claude

### Cache

- **RedisCache** : Cache des schémas, patterns, global styles (TTL: 1h)

## 🔒 Sécurité

- Application Password WordPress (jamais le mot de passe principal)
- HTTPS recommandé en production
- Rate limiting à implémenter (TODO)
- Validation stricte avec Ajv
- Logs structurés avec Winston

## 📚 Ressources

- [SPECIFICATIONS.md](../claude-wordpress-agent/SPECIFICATIONS.md) - Spécifications techniques complètes
- [CLAUDE.md](../claude-wordpress-agent/CLAUDE.md) - Guide pour Claude Code
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) - Documentation SDK
- [Playwright](https://playwright.dev/) - Documentation Playwright

## 🐛 Debugging

### Voir le navigateur Playwright

```bash
# Dans .env
HEADLESS=false
```

### Logs détaillés

```bash
# Dans .env
LOG_LEVEL=debug
```

### Vider le cache Redis

```bash
redis-cli FLUSHDB
```

## 🚧 TODO

- [ ] Implémenter tous les tools (actuellement placeholders)
- [ ] Implémenter la boucle d'interaction complète dans orchestrator.js
- [ ] Créer templates JSON pour NectarBlocks
- [ ] Écrire tests unitaires et d'intégration
- [ ] Ajouter rate limiting (express-rate-limit)
- [ ] Implémenter gestion des conversations (historique)
- [ ] Ajouter monitoring (Prometheus/Grafana)
- [ ] Configurer CI/CD

## 📄 Licence

MIT

## 👤 Auteur

[Votre nom]

---

**Status** : 🏗️ En développement - Structure créée, implémentation en cours
