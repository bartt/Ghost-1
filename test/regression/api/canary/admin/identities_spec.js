const should = require('should');
const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const testUtils = require('../../../../utils');
const localUtils = require('./utils');
const config = require('../../../../../core/shared/config');

const ghost = testUtils.startGhost;

let request;

const verifyJWKS = (endpoint, token) => {
    return new Promise((resolve, reject) => {
        const jwksClient = require('jwks-rsa');
        const client = jwksClient({
            jwksUri: endpoint
        });

        function getKey(header, callback){
            client.getSigningKey(header.kid, (err, key) => {
                let signingKey = key.publicKey || key.rsaPublicKey;
                callback(null, signingKey);
            });
        }

        jwt.verify(token, getKey, {}, (err, decoded) => {
            if (err) {
                reject(err);
            }

            resolve(decoded);
        });
    });
};

describe('Identities API', function () {
    describe('As Owner', function () {
        before(function () {
            return ghost()
                .then(function () {
                    request = supertest.agent(config.get('url'));
                })
                .then(function () {
                    return localUtils.doAuth(request);
                });
        });

        it('Can create JWT token and verify it afterwards with public jwks', function () {
            let identity;

            return request
                .get(localUtils.API.getApiQuery(`identities/`))
                .set('Origin', config.get('url'))
                .expect('Content-Type', /json/)
                .expect('Cache-Control', testUtils.cacheRules.private)
                .expect(200)
                .then((res) => {
                    should.not.exist(res.headers['x-cache-invalidate']);
                    const jsonResponse = res.body;
                    should.exist(jsonResponse);
                    should.exist(jsonResponse.identities);

                    identity = jsonResponse.identities[0];
                })
                .then(() => {
                    return verifyJWKS(`${request.app}/ghost/.well-known/jwks.json`, identity.token);
                })
                .then((decoded) => {
                    decoded.sub.should.equal('jbloggs@example.com');
                });
        });
    });

    describe('As non-Owner', function () {
        before(function () {
            return ghost()
                .then(function (_ghostServer) {
                    request = supertest.agent(config.get('url'));
                })
                .then(function () {
                    return testUtils.createUser({
                        user: testUtils.DataGenerator.forKnex.createUser({email: 'admin+1@ghost.org'}),
                        role: testUtils.DataGenerator.Content.roles[0].name
                    });
                })
                .then(function (admin) {
                    request.user = admin;

                    return localUtils.doAuth(request);
                });
        });

        it('Cannot read', function () {
            return request
                .get(localUtils.API.getApiQuery(`identities/`))
                .set('Origin', config.get('url'))
                .expect('Content-Type', /json/)
                .expect('Cache-Control', testUtils.cacheRules.private)
                .expect(403);
        });
    });
});
