var mongoose = require('mongoose')
  , expect   = require('chai').expect
  , urlSlugs = require('../index')

mongoose.connect('mongodb://localhost:27017/hto-slugs')

mongoose.connection.on('error', function(err) {
  console.error('MongoDB error: ' + err.message)
  console.error('Make sure a mongoDB server is running and accessible by this application')
})

var maxLength = 30
  , TestObjSchema = new mongoose.Schema({ name: String })

TestObjSchema.plugin(
  urlSlugs(
    'name'
  , { addField    : true
    , field       : 'slug'
    , maxLength   : maxLength
    , update      : true
    , saveHistory : true
    }
  )
)

var TestObj = mongoose.model('test_obj', TestObjSchema)

describe('mongoose-url-slugs', function() {
  before(function(done) {
    TestObj.remove(done)
  })

  describe('max_length', function() {
    it('ensures slug length is less than max_length', function(done) {
      TestObj.create({ name: 'super duper long content that cannot possibly fit into a url in any meaningful manner' }, function(err, obj) {
        expect(obj.slug).length.to.be(maxLength)
        done()
      })
    })

    it('sequential slugs work with max_slug_length', function(done) {
      TestObj.create({ name: 'super duper long content that cannot possibly fit into a url' }, function(err, obj) {
        expect(obj.slug).length.to.be(maxLength)
        done()
      })
    })
  })

  it('works', function(done) {
    TestObj.create({ name : 'cool stuff' }, function(err, obj) {
      expect(obj.slug).to.equal('cool-stuff')
      TestObj.create({ name: 'cool stuff' }, function(err, obj) {
        expect(obj.slug).to.equal('cool-stuff-2')
        done()
      })
    })
  })

  it('find the obj with current slug', function(done) {
    TestObj.create({ name : 'a b' }, function(err, obj) {
      obj.name = 'c d'
      obj.save(function(err, obj) {
        expect(obj.slug).to.equal('c-d')
        TestObj.create({ name : 'a b' }, function(err, obj) {
          var _id = obj._id
          TestObj.findBySlug('a-b', function(err, obj) {
            expect(obj._id.equals(_id)).to.be.true
            done()
          })
        })
      })
    })
  })

  it('find the obj by history slug', function(done) {
    TestObj.create({ name : 'e f' }, function(err, obj) {
      obj.name = 'g h'
      var _id = obj._id
      obj.save(function(err, obj) {
        expect(obj.slug).to.equal('g-h')
        TestObj.create({ name : 'i j' }, function(err, obj) {
          TestObj.findBySlugHistory('e-f', function(err, obj) {
            expect(obj._id.equals(_id)).to.be.true
            done()
          })
        })
      })
    })
  })
})