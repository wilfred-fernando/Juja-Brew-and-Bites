import config from '../eslint.config.mjs';
export default [...config, {files:['**/*.jsx'],languageOptions:{parserOptions:{ecmaFeatures:{jsx:true}}}}];
