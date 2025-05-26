module.exports = {
  extends: ['@react-native'],
  rules: {
    'semi': 'off', // Désactiver la règle des point-virgules obligatoires
    'babel/semi': 'off',
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    requireConfigFile: false,
  },
}; 