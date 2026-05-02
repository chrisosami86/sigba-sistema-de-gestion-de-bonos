const pool = require("../../config/db");



const getServerTime = async () => {
  return {
    serverTime: new Date()
  };
};

module.exports = {
  getServerTime
};
