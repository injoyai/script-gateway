const path = require('path');

// CRA 4 默认不转译 node_modules，需要把 @xyflow/react 和 @xyflow/system
// 加入 babel-loader 的 include，以转译其中的可选链(?.)和空值合并(??)语法
module.exports = function override(config, env) {
  const oneOfRule = config.module.rules.find(
    (rule) => Array.isArray(rule.oneOf) && rule.oneOf.length > 0
  );
  if (!oneOfRule) return config;

  for (const rule of oneOfRule.oneOf) {
    const loader = rule.loader || (rule.use && rule.use[0] && rule.use[0].loader);
    if (loader && loader.includes('babel-loader')) {
      const include = Array.isArray(rule.include) ? rule.include : [rule.include].filter(Boolean);
      rule.include = [
        ...include,
        path.resolve('node_modules/@xyflow/react'),
        path.resolve('node_modules/@xyflow/system'),
      ];
      rule.options = rule.options || {};
      rule.options.plugins = [
        ...(rule.options.plugins || []),
        require.resolve('@babel/plugin-proposal-logical-assignment-operators'),
      ];
      break;
    }
  }
  return config;
};
