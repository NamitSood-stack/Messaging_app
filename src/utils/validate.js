
const isId = (value) => typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value);

const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

module.exports = { isId, isUuid };
