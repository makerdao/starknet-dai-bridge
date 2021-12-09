/////////////////////////////////////////////////////////////////////////////////
// Copyright 2019 StarkWare Industries Ltd.                                    //
//                                                                             //
// Licensed under the Apache License, Version 2.0 (the "License").             //
// You may not use this file except in compliance with the License.            //
// You may obtain a copy of the License at                                     //
//                                                                             //
// https://www.starkware.co/open-source-license/                               //
//                                                                             //
// Unless required by applicable law or agreed to in writing,                  //
// software distributed under the License is distributed on an "AS IS" BASIS,  //
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.    //
// See the License for the specific language governing permissions             //
// and limitations under the License.                                          //
/////////////////////////////////////////////////////////////////////////////////

const BN = require('bn.js');
const hash = require('hash.js');
const { curves: eCurves, ec: EllipticCurve } = require('elliptic');
const assert = require('assert');
const constantPointsHex = require('./constant_points.json');

// Equals 2**251 + 17 * 2**192 + 1.
const prime = new BN('800000000000011000000000000000000000000000000000000000000000001', 16);
// Equals 2**251. This value limits msgHash and the signature parts.
const maxEcdsaVal =
    new BN('800000000000000000000000000000000000000000000000000000000000000', 16);

// Generate BN of used constants.
const zeroBn = new BN('0', 16);
const oneBn = new BN('1', 16);
const twoBn = new BN('2', 16);
const twoPow22Bn = new BN('400000', 16);
const twoPow31Bn = new BN('80000000', 16);
const twoPow63Bn = new BN('8000000000000000', 16);

// Create a curve with stark curve parameters.
const starkEc = new EllipticCurve(
    new eCurves.PresetCurve({
        type: 'short',
        prime: null,
        p: prime,
        a: '00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000001',
        b: '06f21413 efbe40de 150e596d 72f7a8c5 609ad26c 15c915c1 f4cdfcb9 9cee9e89',
        n: '08000000 00000010 ffffffff ffffffff b781126d cae7b232 1e66a241 adc64d2f',
        hash: hash.sha256,
        gRed: false,
        g: constantPointsHex[1]
    })
);

const constantPoints = constantPointsHex.map(coords => (
    starkEc.curve.point(new BN(coords[0], 16), new BN(coords[1], 16))));
const shiftPoint = constantPoints[0];

function privateKeyToECPointOnStarkCurve(privateKey) {
  return constantPoints[1].mul(new BN(privateKey, 10));
}

function privateToStarkKey(privateKey) {
  return privateKeyToECPointOnStarkCurve(privateKey).getX().toString();
}

/*
  Checks that the string str start with '0x'.
*/
function hasHexPrefix(str) {
    return str.substring(0, 2) === '0x';
}

/*
 Asserts input is equal to or greater then lowerBound and lower then upperBound.
 Assert message specifies inputName.
 input, lowerBound, and upperBound should be of type BN.
 inputName should be a string.
*/
function assertInRange(
        input,
        lowerBound,
        upperBound,
        inputName = ''
) {
    const messageSuffix = inputName === '' ? 'invalid length' : `invalid ${inputName} length`;
    assert(
        input.gte(lowerBound) && input.lt(upperBound), `Message not signable, ${messageSuffix}.`
    );
}

/*
 Full specification of the hash function can be found here:
   https://starkware.co/starkex/docs/signatures.html#pedersen-hash-function
 shiftPoint was added for technical reasons to make sure the zero point on the elliptic curve does
 not appear during the computation. constantPoints are multiples by powers of 2 of the constant
 points defined in the documentation.
*/
function pedersen(input) {
    let point = shiftPoint;
    for (let i = 0; i < input.length; i++) {
        let x = new BN(input[i], 16);
        assert(x.gte(zeroBn) && x.lt(prime), 'Invalid input: ' + input[i]);
        for (let j = 0; j < 252; j++) {
            const pt = constantPoints[2 + i * 252 + j];
            assert(!point.getX().eq(pt.getX()));
            if (x.and(oneBn).toNumber() !== 0) {
                point = point.add(pt);
            }
            x = x.shrn(1);
        }
    }
    return point.getX().toString(16);
}

/*
 The function _truncateToN in lib/elliptic/ec/index.js does a shift-right of delta bits,
 if delta is positive, where
   delta = msgHash.byteLength() * 8 - starkEx.n.bitLength().
 This function does the opposite operation so that
   _truncateToN(fixMsgHashLen(msgHash)) == msgHash.
*/
function fixMsgHashLen(msgHash) {
    // Convert to BN to remove leading zeros.
    msgHash = new BN(msgHash, 16).toString(16);

    if (msgHash.length <= 62) {
        // In this case, msgHash should not be transformed, as the byteLength() is at most 31,
        // so delta < 0 (see _truncateToN).
        return msgHash;
    }
    assert(msgHash.length === 63);
    // In this case delta will be 4 so we perform a shift-left of 4 bits by adding a zero.
    return msgHash + '0';
}

/*
 Signs a message using the provided key.
 privateKey should be an elliptic.keyPair with a valid private key.
 Returns an elliptic.Signature.
*/
function sign(privateKey, msgHash) {
    const msgHashBN = new BN(msgHash, 16);
    // Verify message hash has valid length.
    assertInRange(msgHashBN, zeroBn, maxEcdsaVal, 'msgHash');
    const msgSignature = privateKey.sign(fixMsgHashLen(msgHash));
    const { r, s } = msgSignature;
    const w = s.invm(starkEc.n);
    // Verify signature has valid length.
    assertInRange(r, oneBn, maxEcdsaVal, 'r');
    assertInRange(s, oneBn, starkEc.n, 's');
    assertInRange(w, oneBn, maxEcdsaVal, 'w');
    return msgSignature;
}

/*
 Verifies a message using the provided key.
 publicKey should be an elliptic.keyPair with a valid public key.
 msgSignature should be an elliptic.Signature.
 Returns a boolean true if the verification succeeds.
*/
function verify(publicKey, msgHash, msgSignature) {
    const msgHashBN = new BN(msgHash, 16);
    // Verify message hash has valid length.
    assertInRange(msgHashBN, zeroBn, maxEcdsaVal, 'msgHash');
    const { r, s } = msgSignature;
    const w = s.invm(starkEc.n);
    // Verify signature has valid length.
    assertInRange(r, oneBn, maxEcdsaVal, 'r');
    assertInRange(s, oneBn, starkEc.n, 's');
    assertInRange(w, oneBn, maxEcdsaVal, 'w');
    return publicKey.verify(fixMsgHashLen(msgHash), msgSignature);
}

module.exports = {
    prime, ec: starkEc, constantPoints, shiftPoint, maxEcdsaVal,  // Data.
    pedersen, sign, verify, privateToStarkKey // Function.
};
