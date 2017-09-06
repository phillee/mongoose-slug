var extend    = require('extend')
  , mongoose  = require.main.require('mongoose')
  , Schema    = mongoose.Schema
  , striptags = require('striptags')

function defaultURLSlugGeneration(text, separator) {
  if (!text) return ''
  var slug = text.toLowerCase().replace(/([^a-z0-9\-\_]+)/g, separator).replace(new RegExp(separator + '{2,}', 'g'), separator);
  if (slug.substr(-1) == separator) {
    slug = slug.substr(0, slug.length-1);
  }
  return slug;
}

var defaultOptions = {
  field: 'slug',
  addField: true,
  generator: defaultURLSlugGeneration,
  separator: '-',
  maxLength: null,
  update: false,
  index: true,
  index_type: String,
  index_default: '',
  index_trim: true,
  index_unique: true,
  index_required: false,
  index_sparse: false,
  saveHistory: false,
  isStripHtml:true,
  historyField: 'slug_history'
};

module.exports = function(slugFields, options) {
  options = extend(true, {}, defaultOptions, options);

  if (slugFields.indexOf(' ') > -1) {
    slugFields = slugFields.split(' ');
  }

  return (function (schema) {
    if (options.addField) {
      var schemaField = {};
      schemaField[options.field] = {type: options.index_type, default: options.index_default, trim: options.index_trim, index: options.index, unique: options.index_unique, required: options.index_required, sparse: options.index_sparse};
      schema.add(schemaField);
    }

    schema.methods.ensureUniqueSlug = function (slug, cb) {
      if (!options.index_unique) return cb(null, true, slug);
      var doc = this,
          model = doc.constructor,
          slugLimited = (options.maxLength && slug.length == options.maxLength)? true : false,
          q = {};

      q[options.field] = new RegExp('^' + (slugLimited? slug.substr(0, slug.length - 2) : slug));
      q._id = {$ne: doc._id};
      var fields = {};
      fields[options.field] = 1;
      model.find(q, fields).exec(function (e, docs) {
        if (e) return cb(e);
        else if (!docs.length) cb(null, true, slug);
        else {
          var max = docs.reduce(function (max, doc) {
            var docSlug = doc.get(options.field, String);
            var count = 1;
            if (docSlug != slug) {
              count = docSlug.match(new RegExp((slugLimited? slug.substr(0, slug.length - 2) : slug) + options.separator + '([0-9]+)$'));
              count = ((count instanceof Array)? parseInt(count[1], 10) : 0) + 1;
            }
            return (count > max)? count : max;
          }, 0);

          if (max == 1) max++; // avoid slug-1, rather do slug-2

          var suffix = options.separator + max;

          if (options.maxLength) return cb(null, false, slug.substr(0, options.maxLength - suffix.length) + suffix);
          else return cb(null, false, slug + suffix);
        }
      });
    };

    schema.statics.findBySlug = function(slug, fields, additionalOptions, cb) {
      var q = {};
      q[options.field] = slug;
      return this.findOne(q, fields, additionalOptions, cb);
    }

    schema.statics.findBySlugHistory = function(slug, fields, additionalOptions, done) {
      if ('function' == typeof fields) {
        done = fields
        additionalOptions = null
        fields = null
      } else if ('function' == typeof additionalOptions) {
        done = additionalOptions
        additionalOptions = null
      }
      var q = {}
        , _this = this
      q[options.field] = slug
      _this.findOne(q, fields, additionalOptions, function(err, result) {
        if (!result) {
          q = {}
          q[options.historyField + '.' + options.field] = slug
          _this.findOne(q, fields, additionalOptions, done)
        } else {
          done(err, result)
        }
      })
    }

    schema.pre('validate', function (next) {
      var doc = this;
      var currentSlug = doc.get(options.field, String);
      if (!doc.isNew && !options.update && currentSlug) return next();

      var slugFieldsModified = doc.isNew? true : false;
      var toSlugify = '';

      if (options.isStripHtml) {
        if (slugFields instanceof Array) {
          for (var i = 0; i < slugFields.length; i++) {
            var slugField = slugFields[i];
            if (doc.isModified(slugField)) slugFieldsModified = true;

            var tmpSlugField = doc.get(slugField, String)
              , slugPart = tmpSlugField ? striptags(tmpSlugField) : tmpSlugField

            if (slugPart) toSlugify +=  slugPart + ' ';
          }
          toSlugify = toSlugify.substr(0, toSlugify.length-1);
        } else {
          if (doc.isModified(slugFields)) slugFieldsModified = true;

          var tmpSlugField = doc.get(slugFields, String)
          toSlugify = tmpSlugField ? striptags(tmpSlugField) : tmpSlugField
        }
      } else {
        if (slugFields instanceof Array) {
          for (var i = 0; i < slugFields.length; i++) {
            var slugField = slugFields[i];
            if (doc.isModified(slugField)) slugFieldsModified = true;
            var slugPart = doc.get(slugField, String);
            if (slugPart) toSlugify +=  slugPart + ' ';
          }
          toSlugify = toSlugify.substr(0, toSlugify.length-1);
        } else {
          if (doc.isModified(slugFields)) slugFieldsModified = true;
          toSlugify = doc.get(slugFields, String);
        }
      }

      if (!slugFieldsModified) return next();

      var newSlug = options.generator(toSlugify, options.separator);

      if (!newSlug.length && options.index_sparse) {
        doc.set(options.field, undefined);
        return next();
      }

      if (options.maxLength) newSlug = newSlug.substr(0, options.maxLength);

      doc.ensureUniqueSlug(newSlug, function (e, exists, finalSlug) {
        if (e) return next(e);
        doc.set(options.field, finalSlug);
        doc.markModified(options.field, finalSlug); // sometimes required :)

        if (options.saveHistory) {
          if (currentSlug && currentSlug != '') {
            if (!doc.get(options.historyField)) {
              var historyField = {}
                , historySchema = new Schema({
                    slug : {
                        type     : options.index_type
                      , trim     : options.index_trim
                      , index    : options.index
                      , required : options.index_required
                      , sparse   : options.index_sparse
                    },
                    createdAt : Date
                  }, {
                    _id : false
                  });

              historyField[options.historyField] = [ historySchema ];
              schema.add(historyField)

              doc.set(options.historyField, {
                  slug : currentSlug
                , createdAt : new Date()
              });
            } else {
              var history = doc.get(options.historyField)

              history.push({
                  slug : currentSlug
                , createdAt : new Date()
              })

              doc.set(options.historyField, history);
              doc.markModified(options.historyField, history);
            }
          }
        }

        next();
      });

    });
  });
};