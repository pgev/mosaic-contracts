// Copyright 2019 OpenST Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// ----------------------------------------------------------------------------
//
// http://www.simpletoken.org/
//
// ----------------------------------------------------------------------------

const Gateway = artifacts.require("./TestEIP20Gateway.sol");
const MockToken = artifacts.require("MockToken");

const BN = require('bn.js');
const EventDecoder = require('../../test_lib/event_decoder.js');
const messageBus = require('../../test_lib/message_bus.js');
const Utils = require('../../../test/test_lib/utils');
const cogatewayUtils = require('../../../test/gateway/eip20_cogateway/helpers/co_gateway_utils');
const StubData = require('../../data/redeem_revoked_1.json');

const NullAddress = Utils.NULL_ADDRESS;

async function setStorageRoot(gateway) {

  let blockHeight = new BN(StubData.co_gateway.revert_redeem.proof_data.block_number, 16);
  let storageRoot = StubData.co_gateway.revert_redeem.proof_data.storageHash;
  await gateway.setStorageRoot(blockHeight, storageRoot);
  return blockHeight;
}

contract('EIP20Gateway.confirmRevertRedeemIntent()', function (accounts) {

  let gateway,
    mockToken,
    baseToken,
    unstakeRequest,
    unstakeMessage,
    stakeVaultAddress;

  let bountyAmount = new BN(StubData.gateway.constructor.bountyAmount, 16);
  let MessageStatusEnum = messageBus.MessageStatusEnum;
  let redeemRequest = StubData.co_gateway.redeem.params;

  beforeEach(async function () {
    redeemRequest = StubData.co_gateway.redeem.params;
    mockToken = await MockToken.new({from: accounts[0]});
    baseToken = await MockToken.new({from: accounts[0]});

    let organizationAddress = accounts[3];
    let coreAddress = accounts[5];
    gateway = await Gateway.new(
      mockToken.address,
      baseToken.address,
      coreAddress,
      bountyAmount,
      organizationAddress,
      NullAddress, //burner address
    );

    unstakeRequest = {
      beneficiary: redeemRequest.beneficiary,
      amount: new BN(redeemRequest.amount, 16),
    };

    let redeemIntentHash = cogatewayUtils.hashRedeemIntent(
      unstakeRequest.amount,
      unstakeRequest.beneficiary,
      StubData.contracts.coGateway,
    );

    unstakeMessage = {
      intentHash: redeemIntentHash,
      nonce: new BN(redeemRequest.nonce, 16),
      gasPrice: new BN(redeemRequest.gasPrice, 16),
      gasLimit: new BN(redeemRequest.gasLimit, 16),
      unstakeAccount: redeemRequest.redeemer,
      hashLock: redeemRequest.hashLock,
      unlockSecret: redeemRequest.unlockSecret,
    };
    stakeVaultAddress = await setup(
      unstakeMessage,
      gateway,
      unstakeRequest,
      stakeVaultAddress,
      mockToken,
      accounts,
    );

  });

  it('should confirm revert redeem intent', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Declared);

    let blockHeight = await setStorageRoot(gateway);
    let storageProof = StubData.co_gateway.revert_redeem.proof_data.storageProof[0].serializedProof;

    await gateway.confirmRevertRedeemIntent(
      unstakeMessage.messageHash,
      blockHeight,
      storageProof,
    );
  });

  it('should return correct response', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Declared);

    let blockHeight = await setStorageRoot(gateway);
    let storageProof = StubData.co_gateway.revert_redeem.proof_data.storageProof[0].serializedProof;

    let response = await gateway.confirmRevertRedeemIntent.call(
      unstakeMessage.messageHash,
      blockHeight,
      storageProof,
    );

    assert.strictEqual(
      response.redeemer_,
      unstakeMessage.unstakeAccount,
      `Expected redeemer ${unstakeMessage.unstakeAccount} is different from redeemer from 
      event ${response.redeemer_}`,
    );
    assert.strictEqual(
      response.redeemerNonce_.eq(unstakeMessage.nonce),
      true,
      `Expected stakerNonce ${unstakeMessage.nonce.toString(10)} is different from nonce from 
      event ${response.redeemerNonce_.toString(10)}`,
    );
    assert.strictEqual(
      response.amount_.eq(unstakeRequest.amount),
      true,
      `Expected amount ${unstakeRequest.amount.toString(10)} is different from amount from 
      event ${response.amount_.toString(10)}`,
    );

  });

  it('should emit RevertRedeemIntentConfirmed event', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Declared);

    let blockHeight = await setStorageRoot(gateway);
    let storageProof = StubData.co_gateway.revert_redeem.proof_data.storageProof[0].serializedProof;

    let tx = await gateway.confirmRevertRedeemIntent(
      unstakeMessage.messageHash,
      blockHeight,
      storageProof,
    );

    assert.strictEqual(
      tx.receipt.status,
      true,
      'Transaction should success.',
    );

    let event = EventDecoder.getEvents(tx, gateway);
    let eventData = event.RevertRedeemIntentConfirmed;

    assert.isDefined(
      event.RevertRedeemIntentConfirmed,
      'Event `RevertRedeemIntentConfirmed` must be emitted.',
    );
    assert.strictEqual(
      eventData._messageHash,
      unstakeMessage.messageHash,
      `Expected message hash ${unstakeMessage.messageHash} is different from message hash from 
      event ${eventData._messageHash}`,
    );
    assert.strictEqual(
      eventData._redeemer,
      unstakeMessage.unstakeAccount,
      `Expected redeemer ${unstakeMessage.unstakeAccount} is different from redeemer from 
      event ${eventData._redeemer}`,
    );
    assert.strictEqual(
      eventData._redeemerNonce.eq(unstakeMessage.nonce),
      true,
      `Expected stakerNonce ${unstakeMessage.nonce.toString(10)} is different from nonce from 
      event ${eventData._redeemerNonce.toString(10)}`,
    );
    assert.strictEqual(
      eventData._amount.eq(unstakeRequest.amount),
      true,
      `Expected amount ${unstakeRequest.amount.toString(10)} is different from amount from 
      event ${eventData._amount.toString(10)}`,
    );

  });

  it('should fail if revert redeem intent is already confirmed', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Declared);

    let blockHeight = await setStorageRoot(gateway);
    let storageProof = StubData.co_gateway.revert_redeem.proof_data.storageProof[0].serializedProof;

    await gateway.confirmRevertRedeemIntent(
      unstakeMessage.messageHash,
      blockHeight,
      storageProof,
    );

    await Utils.expectRevert(
      gateway.confirmRevertRedeemIntent(
        unstakeMessage.messageHash,
        blockHeight,
        storageProof,
      ),
      'Message on target must be Declared.',
    );
  });

  it('should fail for undeclared message', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Undeclared);

    let blockHeight = await setStorageRoot(gateway);
    let storageProof = StubData.co_gateway.revert_redeem.proof_data.storageProof[0].serializedProof;

    await Utils.expectRevert(
      gateway.confirmRevertRedeemIntent(
        unstakeMessage.messageHash,
        blockHeight,
        storageProof,
      ),
      'Message on target must be Declared.',
    );
  });

  it('should fail for progressed message', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Progressed);

    let blockHeight = await setStorageRoot(gateway);
    let storageProof = StubData.co_gateway.revert_redeem.proof_data.storageProof[0].serializedProof;

    await Utils.expectRevert(
      gateway.confirmRevertRedeemIntent(
        unstakeMessage.messageHash,
        blockHeight,
        storageProof,
      ),
      'Message on target must be Declared.',
    );
  });

  it('should fail for zero message hash', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Declared);

    let blockHeight = await setStorageRoot(gateway);
    let storageProof = StubData.co_gateway.revert_redeem.proof_data.storageProof[0].serializedProof;

    await Utils.expectRevert(
      gateway.confirmRevertRedeemIntent(
        Utils.ZERO_BYTES32,
        blockHeight,
        storageProof,
      ),
      'Message hash must not be zero.',
    );
  });

  it('should fail for blank rlp parent nodes(storage proof)', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Declared);

    let blockHeight = await setStorageRoot(gateway);
    let storageProof = '0x';

    await Utils.expectRevert(
      gateway.confirmRevertRedeemIntent(
        unstakeMessage.messageHash,
        blockHeight,
        storageProof,
      ),
      'RLP parent nodes must not be zero.',
    );
  });

  it('should fail if storage root is not available for given block height', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Declared);

    let blockHeight = new BN(StubData.co_gateway.revert_redeem.proof_data.block_number, 16);
    let storageProof = StubData.co_gateway.revert_redeem.proof_data.storageProof[0].serializedProof;

    await Utils.expectRevert(
      gateway.confirmRevertRedeemIntent(
        unstakeMessage.messageHash,
        blockHeight,
        storageProof,
      ),
      'Storage root must not be zero.',
    );

  });

  it('should fail for wrong merkle proof', async function () {

    await gateway.setInboxStatus(unstakeMessage.messageHash, MessageStatusEnum.Declared);

    let blockHeight = await setStorageRoot(gateway);
    // Using revert proof instead of revert_redeem proof.
    let storageProof = StubData.co_gateway.redeem.proof_data.storageProof[0].serializedProof;

    await Utils.expectRevert(
      gateway.confirmRevertRedeemIntent(
        unstakeMessage.messageHash,
        blockHeight,
        storageProof,
      ),
      'Merkle proof verification failed.',
    );
  });
});

async function setup(unstakeMessage, gateway, unstakeRequest, stakeVaultAddress, mockToken, accounts) {
  unstakeMessage.messageHash = messageBus.messageDigest(
    unstakeMessage.intentHash,
    unstakeMessage.nonce,
    unstakeMessage.gasPrice,
    unstakeMessage.gasLimit,
    unstakeMessage.unstakeAccount,
    unstakeMessage.hashLock,
  );
  await gateway.setMessage(
    unstakeMessage.intentHash,
    unstakeMessage.nonce,
    unstakeMessage.gasPrice,
    unstakeMessage.gasLimit,
    unstakeMessage.unstakeAccount,
    unstakeMessage.hashLock,
  );

  await gateway.setUnstake(
    unstakeMessage.messageHash,
    unstakeRequest.beneficiary,
    unstakeRequest.amount,
  );

  stakeVaultAddress = await gateway.stakeVault.call();

  await mockToken.transfer(
    stakeVaultAddress,
    unstakeRequest.amount,
    {from: accounts[0]},
  );
  return stakeVaultAddress;
}
