/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NotEnoughFundsError } from '../../../account/errors'
import { useAccountFixture, useMinersTxFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { ERROR_CODES } from '../../adapters'

const TEST_PARAMS = {
  fromAccountName: 'existingAccount',
  receives: [
    {
      publicAddress: 'test2',
      amount: BigInt(10).toString(),
      memo: '',
    },
  ],
  fee: BigInt(1).toString(),
}

const TEST_PARAMS_MULTI = {
  fromAccountName: 'existingAccount',
  receives: [
    {
      publicAddress: 'test2',
      amount: BigInt(10).toString(),
      memo: '',
    },
    {
      publicAddress: 'test3',
      amount: BigInt(10).toString(),
      memo: '',
    },
  ],
  fee: BigInt(1).toString(),
}

describe('Transactions sendTransaction', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.accounts.createAccount('existingAccount', true)
  })

  it('throws if account does not exist', async () => {
    await expect(
      routeTest.client.sendTransaction({
        ...TEST_PARAMS,
        fromAccountName: 'AccountDoesNotExist',
      }),
    ).rejects.toThrowError('No account found with name AccountDoesNotExist')
  })

  it('throws if not connected to network', async () => {
    routeTest.node.peerNetwork['_isReady'] = false

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrowError(
      'Your node must be connected to the Iron Fish network to send a transaction',
    )
  })

  it('throws if the chain is outdated', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = false

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrowError(
      'Your node must be synced with the Iron Fish network to send a transaction. Please try again later',
    )
  })

  it('throws if not enough funds', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'Your balance is too low. Add funds to your account first',
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )

    await expect(routeTest.client.sendTransaction(TEST_PARAMS_MULTI)).rejects.toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'Your balance is too low. Add funds to your account first',
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('throws if the confirmed balance is too low', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    jest.spyOn(routeTest.node.accounts, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(0),
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'Please wait a few seconds for your balance to update and try again',
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )

    jest.spyOn(routeTest.node.accounts, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(21),
      confirmed: BigInt(0),
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS_MULTI)).rejects.toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          'Please wait a few seconds for your balance to update and try again',
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('throws if pay throws NotEnoughFundsError', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    await useAccountFixture(routeTest.node.accounts, 'account-throw-error')

    jest.spyOn(routeTest.node.accounts, 'pay').mockRejectedValue(new NotEnoughFundsError())
    jest.spyOn(routeTest.node.accounts, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(11),
    })

    await expect(routeTest.client.sendTransaction(TEST_PARAMS)).rejects.toThrowError(
      expect.objectContaining({
        message: expect.stringContaining('Your balance changed while creating a transaction.'),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('calls the pay method on the node with single recipient', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.accounts, 'account')
    const tx = await useMinersTxFixture(routeTest.node.accounts, account)

    jest.spyOn(routeTest.node.accounts, 'pay').mockResolvedValue(tx)
    jest.spyOn(routeTest.node.accounts, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(11),
      confirmed: BigInt(11),
    })

    const result = await routeTest.client.sendTransaction(TEST_PARAMS)
    expect(result.content.hash).toEqual(tx.unsignedHash().toString('hex'))
  })

  it('calls the pay method on the node with multiple recipient', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const account = await useAccountFixture(routeTest.node.accounts, 'account_multi-output')
    const tx = await useMinersTxFixture(routeTest.node.accounts, account)

    jest.spyOn(routeTest.node.accounts, 'pay').mockResolvedValue(tx)
    jest.spyOn(routeTest.node.accounts, 'getBalance').mockResolvedValueOnce({
      unconfirmed: BigInt(21),
      confirmed: BigInt(21),
    })

    const result = await routeTest.client.sendTransaction(TEST_PARAMS_MULTI)
    expect(result.content.hash).toEqual(tx.unsignedHash().toString('hex'))
  })

  it('lets you configure the expiration', async () => {
    const account = await useAccountFixture(routeTest.node.accounts, 'expiration')
    const tx = await useMinersTxFixture(routeTest.node.accounts, account)

    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    jest.spyOn(routeTest.node.accounts, 'getBalance').mockResolvedValue({
      unconfirmed: BigInt(100000),
      confirmed: BigInt(100000),
    })

    const paySpy = jest.spyOn(routeTest.node.accounts, 'pay').mockResolvedValue(tx)

    await routeTest.client.sendTransaction(TEST_PARAMS)

    expect(paySpy).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      routeTest.node.config.get('defaultTransactionExpirationSequenceDelta'),
      undefined,
    )

    await routeTest.client.sendTransaction({
      ...TEST_PARAMS,
      expirationSequence: 1234,
      expirationSequenceDelta: 12345,
    })

    expect(paySpy).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      12345,
      1234,
    )
  })
})
