# Tests

Ce dossier contient les tests Jest pour le serveur Node.js.

## Structure

- **unit/** - Tests unitaires pour les modules individuels
- **integration/** - Tests d'intégration pour les workflows complets

## Tests Unitaires (unit/)

Testent les modules isolément :

- `clients/wordpress-api.test.js` - Tests du client WordPress API
- `clients/gutenberg-controller.test.js` - Tests du controller Playwright
- `validation/block-validator.test.js` - Tests de validation Ajv
- `cache/redis-cache.test.js` - Tests du cache Redis
- `agent/orchestrator.test.js` - Tests de l'orchestrateur (mocké)

## Tests d'Intégration (integration/)

Testent les workflows complets :

- `create-page.test.js` - Test de création d'une page complète
- `block-validation.test.js` - Test du workflow de validation de blocs
- `error-handling.test.js` - Test de la gestion d'erreurs
- `cache-workflow.test.js` - Test du workflow avec cache

## Exécution des tests

```bash
# Tous les tests
npm test

# Tests en mode watch
npm run test:watch

# Tests avec couverture
npm test -- --coverage

# Tests d'un fichier spécifique
npm test -- wordpress-api.test.js
```

## Configuration

Les tests utilisent :

- **Jest** comme framework de test
- **Mock Service Worker (MSW)** pour mocker les appels API WordPress
- **Playwright Test** pour tester le Gutenberg Controller
- **Redis Mock** pour les tests de cache sans Redis réel

## TODO

- [ ] Créer tests unitaires pour tous les modules src/
- [ ] Créer tests d'intégration pour les workflows principaux
- [ ] Configurer jest.config.js
- [ ] Configurer coverage minimum (80%)
- [ ] Configurer CI/CD pour exécuter les tests automatiquement
