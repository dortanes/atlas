import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,jsx,ts,tsx,vue}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: vueParser,
      parserOptions: {
        parser: typescriptParser,
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        _: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      vue,
    },
    rules: {
      'vue/singleline-html-element-content-newline': 0,
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/no-v-model-argument': 0,
      '@typescript-eslint/no-var-requires': 0,
      'no-unused-vars': 0,
      'vue/no-v-html': 0,
    },
  },
  {
    ignores: [
      '.build/',
      'public/',
      '**/*.min.js',
      '**/*.d.ts',
      'node_modules/',
      'vite.config.d.ts',
      'tsconfig.node.tsbuildinfo',
    ],
  },
  prettier,
];