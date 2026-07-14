/** Load serverless-offline only for local dev (set SLS_OFFLINE=1). */
module.exports = process.env.SLS_OFFLINE === '1' ? ['serverless-offline'] : [];
