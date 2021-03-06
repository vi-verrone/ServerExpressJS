﻿var config = require('config.json');

const repository = 'users';
/** dati di Mock */
const bootstrapData = require('../mock/' + repository);

var _ = require('lodash');
var jwt = require('jsonwebtoken');
var bcrypt = require('bcryptjs');
var Q = require('q');
var mongo = require('mongoskin');
var db = mongo.db(config.connectionStrings.SDC, {
    native_parser: true
});
db.bind(repository);

var service = {};

service.init = initData;
service.authenticate = authenticate;
service.getAll = getAll;
service.getById = getById;
service.create = create;
service.update = update;
service.delete = _delete;

module.exports = service;

function initData() {
    // validation
    // 0) prepare bootstrapData
    bootstrapData.forEach(function (item) {
        if (item._id) {
            item._id = mongo.helper.toObjectID(item._id);
        }
    });
    const q = Q.defer();
    // 1) Drop collection Insert bootstrapData
    db[repository].drop(null, function (err) {
        if (err) console.log('Cannot Drop Repository', repository, err);
        // 2) inset mock data
        db[repository].insertMany(bootstrapData, function (err, res) {
            if (err) console.log('Init Error', repository, err);
            q.resolve();
        });
    })
    return q.promise;
}

function authenticate(username, password) {
    var deferred = Q.defer();

    db.users.findOne({
        username: username
    }, function (err, user) {
        if (err) deferred.reject(err.name + ': ' + err.message);

        if (user && bcrypt.compareSync(password, user.hash)) {
            // authentication successful
            deferred.resolve({
                _id: user._id,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                token: jwt.sign({
                    sub: user._id
                }, config.secret)
            });
        } else {
            // authentication failed
            deferred.resolve();
        }
    });

    return deferred.promise;
}

function getAll() {
    var deferred = Q.defer();

    db.users.find().toArray(function (err, users) {
        if (err) deferred.reject(err.name + ': ' + err.message);

        // return users (without hashed passwords)
        users = _.map(users, function (user) {
            return _.omit(user, 'hash');
        });

        deferred.resolve(users);
    });

    return deferred.promise;
}

function getById(_id) {
    var deferred = Q.defer();

    db.users.findById(_id, function (err, user) {
        if (err) deferred.reject(err.name + ': ' + err.message);

        if (user) {
            // return user (without hashed password)
            deferred.resolve(_.omit(user, 'hash'));
        } else {
            // user not found
            deferred.resolve();
        }
    });

    return deferred.promise;
}

function create(user) {
    var deferred = Q.defer();
    // validation
    db.users.findOne({
            username: user.username
        },
        function (err, _user) {
            if (err) deferred.reject(err.name + ': ' + err.message);
            if (_user) {
                // username already exists
                deferred.reject('Username "' + user.username + '" is already taken');
            } else {
                createUser();
            }
        }
    );

    function createUser() {
        // set user object to user without the cleartext password
        var _user = _.omit(user, 'password');

        // add hashed password to user object
        _user.hash = bcrypt.hashSync(user.password, 10);

        db.users.insert(
            _user,
            function (err, doc) {
                if (err) return deferred.reject(err.name + ': ' + err.message);
                user._id = doc._id;
                deferred.resolve(user);
            });
    }

    return deferred.promise;
}

function update(_id, userParam) {
    var deferred = Q.defer();

    // validation
    db.users.findById(_id, function (err, user) {
        if (err) deferred.reject(err.name + ': ' + err.message);

        if (user.username !== userParam.username) {
            // username has changed so check if the new username is already taken
            db.users.findOne({
                    username: userParam.username
                },
                function (err, user) {
                    if (err) deferred.reject(err.name + ': ' + err.message);

                    if (user) {
                        // username already exists
                        deferred.reject('Username "' + req.body.username + '" is already taken')
                    } else {
                        updateUser();
                    }
                });
        } else {
            updateUser();
        }
    });

    function updateUser() {
        // fields to update
        var set = {
            firstName: userParam.firstName,
            lastName: userParam.lastName,
            username: userParam.username,
        };

        // update password if it was entered
        if (userParam.password) {
            set.hash = bcrypt.hashSync(userParam.password, 10);
        }

        db.users.update({
                _id: mongo.helper.toObjectID(_id)
            }, {
                $set: set
            },
            function (err, doc) {
                if (err) deferred.reject(err.name + ': ' + err.message);

                deferred.resolve();
            });
    }

    return deferred.promise;
}

function _delete(_id) {
    var deferred = Q.defer();

    db.users.remove({
            _id: mongo.helper.toObjectID(_id)
        },
        function (err) {
            if (err) deferred.reject(err.name + ': ' + err.message);

            deferred.resolve();
        });

    return deferred.promise;
}