var Sequelize = require('sequelize');
var SqlString = require('../sql-string');
var _ = Sequelize.Utils._;

exports.generateTypeScript = function generateJavaScript(autoSequelize, table) {

  var text = {};
  var tables = [];

  var fields = _.keys(autoSequelize.tables[table])
    , spaces = ''
    , quoteWrapper = '"';

  for (var x = 0; x < autoSequelize.options.indentation; ++x) {
    spaces += (autoSequelize.options.spaces === true ? ' ' : "\t");
  }

  text[table] = "/* jshint indent: " + autoSequelize.options.indentation + " */\n\n";
  text[table] += "module.exports = function(sequelize, DataTypes) {\n";
  var tableName = autoSequelize.options.camelCase ? _.camelCase(table) : table;
  text[table] += spaces + "return sequelize.define('" + tableName + "', {\n";

  _.each(fields, function(field, i){

    // Find foreign key
    var foreignKey = autoSequelize.foreignKeys[table] && autoSequelize.foreignKeys[table][field] ? autoSequelize.foreignKeys[table][field] : null

    if (_.isObject(foreignKey)) {
      autoSequelize.tables[table][field].foreignKey = foreignKey
    }

    // column's attributes
    var fieldAttr = _.keys(autoSequelize.tables[table][field]);
    var fieldName = autoSequelize.options.camelCase ? _.camelCase(field) : field;
    text[table] += spaces + spaces + fieldName + ": {\n";

    // Serial key for postgres...
    var defaultVal = autoSequelize.tables[table][field].defaultValue;

    // ENUMs for postgres...
    if (autoSequelize.tables[table][field].type === "USER-DEFINED" && !! autoSequelize.tables[table][field].special) {
      autoSequelize.tables[table][field].type = "ENUM(" + autoSequelize.tables[table][field].special.map(function(f){ return quoteWrapper + f + quoteWrapper; }).join(',') + ")";
    }

    var isUnique = autoSequelize.tables[table][field].foreignKey && autoSequelize.tables[table][field].foreignKey.isUnique

    _.each(fieldAttr, function(attr, x){
      var isSerialKey = autoSequelize.tables[table][field].foreignKey && _.isFunction(autoSequelize.dialect.isSerialKey) && autoSequelize.dialect.isSerialKey(autoSequelize.tables[table][field].foreignKey)

      // We don't need the special attribute from postgresql describe table..
      if (attr === "special") {
        return true;
      }

      if (attr === "foreignKey") {
        if (isSerialKey) {
          text[table] += spaces + spaces + spaces + "autoIncrement: true";
        }
        else if (foreignKey.isForeignKey) {
          text[table] += spaces + spaces + spaces + "references: {\n";
          text[table] += spaces + spaces + spaces + spaces + "model: \'" + autoSequelize.tables[table][field][attr].foreignSources.target_table + "\',\n"
          text[table] += spaces + spaces + spaces + spaces + "key: \'" + autoSequelize.tables[table][field][attr].foreignSources.target_column + "\'\n"
          text[table] += spaces + spaces + spaces + "}"
        } else return true
      }
      else if (attr === "primaryKey") {
          if (autoSequelize.tables[table][field][attr] === true && (! _.has(autoSequelize.tables[table][field], 'foreignKey') || (_.has(autoSequelize.tables[table][field], 'foreignKey') && !! autoSequelize.tables[table][field].foreignKey.isPrimaryKey)))
          text[table] += spaces + spaces + spaces + "primaryKey: true";
        else return true
      }
      else if (attr === "allowNull") {
        text[table] += spaces + spaces + spaces + attr + ": " + autoSequelize.tables[table][field][attr];
      }
      else if (attr === "defaultValue") {
        if (autoSequelize.sequelize.options.dialect === "mssql" &&  defaultVal && defaultVal.toLowerCase() === '(newid())') {
          defaultVal = null; // disable adding "default value" attribute for UUID fields if generating for MS SQL
        }

        var val_text = defaultVal;

        if (isSerialKey) return true

        //mySql Bit fix
        if (autoSequelize.tables[table][field].type.toLowerCase() === 'bit(1)') {
          val_text = defaultVal === "b'1'" ? 1 : 0;
        }
        // mssql bit fix
        else if (autoSequelize.sequelize.options.dialect === "mssql" && autoSequelize.tables[table][field].type.toLowerCase() === "bit") {
          val_text = defaultVal === "((1))" ? 1 : 0;
        }

        if (_.isString(defaultVal)) {
          var field_type = autoSequelize.tables[table][field].type.toLowerCase();
          if (field_type.indexOf('date') === 0 || field_type.indexOf('timestamp') === 0) {
            if (_.endsWith(defaultVal, '()')) {
              val_text = "sequelize.fn('" + defaultVal.replace(/\(\)$/, '') + "')"
            }
            else if (_.includes(['current_timestamp', 'current_date', 'current_time', 'localtime', 'localtimestamp'], defaultVal.toLowerCase())) {
              val_text = "sequelize.literal('" + defaultVal + "')"
            } else {
              val_text = quoteWrapper + val_text + quoteWrapper
            }
          } else {
            val_text = quoteWrapper + val_text + quoteWrapper
          }
        }

        if(defaultVal === null || defaultVal === undefined) {
          return true;
        } else {
          val_text = _.isString(val_text) ? SqlString.escape(_.trim(val_text, '"'), null, autoSequelize.options.dialect) : val_text;

          // don't prepend N for MSSQL when building models...
          val_text = _.trimStart(val_text, 'N')
          text[table] += spaces + spaces + spaces + attr + ": " + val_text;
        }
      }
      else if (attr === "type" && autoSequelize.tables[table][field][attr].indexOf('ENUM') === 0) {
        text[table] += spaces + spaces + spaces + attr + ": DataTypes." + autoSequelize.tables[table][field][attr];
      } else {
        var _attr = (autoSequelize.tables[table][field][attr] || '').toLowerCase();
        var val = quoteWrapper + autoSequelize.tables[table][field][attr] + quoteWrapper;

        if (_attr === "boolean" || _attr === "bit(1)" || _attr === "bit") {
          val = 'DataTypes.BOOLEAN';
        }
        else if (_attr.match(/^(smallint|mediumint|tinyint|int)/)) {
          var length = _attr.match(/\(\d+\)/);
          val = 'DataTypes.INTEGER' + (!  _.isNull(length) ? length : '');

          var unsigned = _attr.match(/unsigned/i);
          if (unsigned) val += '.UNSIGNED'

          var zero = _attr.match(/zerofill/i);
          if (zero) val += '.ZEROFILL'
        }
        else if (_attr.match(/^bigint/)) {
          val = 'DataTypes.BIGINT';
        }
        else if (_attr.match(/^varchar/)) {
          var length = _attr.match(/\(\d+\)/);
          val = 'DataTypes.STRING' + (!  _.isNull(length) ? length : '');
        }
        else if (_attr.match(/^string|varying|nvarchar/)) {
          val = 'DataTypes.STRING';
        }
        else if (_attr.match(/^char/)) {
          var length = _attr.match(/\(\d+\)/);
          val = 'DataTypes.CHAR' + (!  _.isNull(length) ? length : '');
        }
        else if (_attr.match(/^real/)) {
          val = 'DataTypes.REAL';
        }
        else if (_attr.match(/text|ntext$/)) {
          val = 'DataTypes.TEXT';
        }
        else if (_attr.match(/^(date)/)) {
          val = 'DataTypes.DATE';
        }
        else if (_attr.match(/^(time)/)) {
          val = 'DataTypes.TIME';
        }
        else if (_attr.match(/^(float|float4)/)) {
          val = 'DataTypes.FLOAT';
        }
        else if (_attr.match(/^decimal/)) {
          val = 'DataTypes.DECIMAL';
        }
        else if (_attr.match(/^(float8|double precision|numeric)/)) {
          val = 'DataTypes.DOUBLE';
        }
        else if (_attr.match(/^uuid|uniqueidentifier/)) {
          val = 'DataTypes.UUIDV4';
        }
        else if (_attr.match(/^json/)) {
          val = 'DataTypes.JSON';
        }
        else if (_attr.match(/^jsonb/)) {
          val = 'DataTypes.JSONB';
        }
        else if (_attr.match(/^geometry/)) {
          val = 'DataTypes.GEOMETRY';
        }
        text[table] += spaces + spaces + spaces + attr + ": " + val;
      }

      text[table] += ",";
      text[table] += "\n";
    });

    if (isUnique) {
      text[table] += spaces + spaces + spaces + "unique: true,\n";
    }

    if (autoSequelize.options.camelCase) {
      text[table] += spaces + spaces + spaces + "field: '" + field + "',\n";
    }

    // removes the last `,` within the attribute options
    text[table] = text[table].trim().replace(/,+$/, '') + "\n";

    text[table] += spaces + spaces + "}";
    if ((i+1) < fields.length) {
      text[table] += ",";
    }
    text[table] += "\n";
  });

  text[table] += spaces + "}";

  //conditionally add additional options to tag on to orm objects
  var hasadditional = _.isObject(autoSequelize.options.additional) && _.keys(autoSequelize.options.additional).length > 0;

  text[table] += ", {\n";

  text[table] += spaces + spaces  + "tableName: '" + table + "',\n";

  if (hasadditional) {
    _.each(autoSequelize.options.additional, addAdditionalOption)
  }

  text[table] = text[table].trim()
  text[table] = text[table].substring(0, text[table].length - 1);
  text[table] += "\n" + spaces + "}";

  function addAdditionalOption(value, key) {
    if (key === 'name') {
      // name: true - preserve table name always
      text[table] += spaces + spaces + "name: {\n";
      text[table] += spaces + spaces + spaces + "singular: '" + table + "',\n";
      text[table] += spaces + spaces + spaces + "plural: '" + table + "'\n";
      text[table] += spaces + spaces + "},\n";
    }
    else {
      text[table] += spaces + spaces + key + ": " + value + ",\n";
    }
  }

  //resume normal output
  text[table] += ");\n};\n";
  return text;

}
