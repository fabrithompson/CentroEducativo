// Configuración de ESLint para todo el monorepo (flat config, ESLint 9).
//
// Corre en tres lugares, con las mismas reglas:
// - en el editor, con la extensión de ESLint (ver `.vscode/`);
// - antes de cada commit, sobre los archivos en stage (Husky + lint-staged);
// - en el CI, sobre todo el repositorio (`pnpm lint`).
//
// Los errores bloquean; las advertencias no. Lo que es un defecto casi seguro
// —una variable sin declarar, código inalcanzable, un `==` contra null mal
// puesto— es error. Lo que es deuda de estilo del código que ya existía
// —`any` explícito, variables sin usar— queda como advertencia, para poder
// adoptar el linter hoy sin reescribir 17 000 líneas en el mismo PR.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const reglasJs = {
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
};

const reglasTs = {
  ...reglasJs,
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  // `ok ? enviados++ : fallidos++` es un modismo legítimo para contar.
  '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.tmp/**',
      '**/.expo/**',
      'web/backend/uploads/**',
      '.railway/**',
    ],
  },

  js.configs.recommended,

  // Backend, scripts y semillas: TypeScript sobre Node.
  {
    files: ['web/backend/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: reglasJs,
  },
  {
    files: ['web/backend/**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: reglasTs,
  },

  // App móvil: TypeScript + React Native.
  {
    files: ['mobile/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...reglasTs,
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Frontend web: JavaScript plano en el navegador. Las vistas y la capa de
  // API son módulos ES; el resto se carga con <script> clásico y comparte el
  // ámbito global, así que sus funciones se llaman desde los `onclick` del
  // HTML y ESLint no puede ver ese uso.
  {
    files: ['web/frontend/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      // `toast.js` cuelga sus funciones de `window` y las demás páginas las
      // usan sin prefijo; Socket.IO expone `io` desde su propio <script>.
      globals: {
        ...globals.browser,
        io: 'readonly',
        showToast: 'readonly',
        toastSuccess: 'readonly',
        toastError: 'readonly',
        toastWarning: 'readonly',
        toastInfo: 'readonly',
      },
    },
    rules: {
      ...reglasJs,
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    files: ['web/frontend/js/api.js', 'web/frontend/js/ui.js', 'web/frontend/js/vistas/**/*.js'],
    languageOptions: { sourceType: 'module' },
  },

  // Scripts de la raíz (métricas): Node.
  {
    files: ['scripts/**/*.mjs', '*.mjs'],
    languageOptions: { globals: globals.node },
    rules: reglasJs,
  },
);
