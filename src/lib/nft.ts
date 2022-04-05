import algosdk from 'algosdk';
import * as DigestProvider from '@common/src/services/DigestProvider';
import { metadataNFTType, NFTMetadataBackend } from './type';
import { Wallet } from 'algorand-session-wallet';
import { none, option, some } from '@octantis/option';
import Container from 'typedi';
import ProcessDialog from '@/service/ProcessDialog';

const mdhash = DigestProvider.get();
const dialog = Container.get(ProcessDialog);

export interface AssetInfo {
  transactionId: number;
  assetID: number;
}

async function createAsset(
  algodClient: algosdk.Algodv2,
  account: string,
  metadat: any,
  wallet: any
) {
  dialog.message = 'Checking blockchain connection...';
  //Check algorand node status
  const status = await algodClient.status().do();
  console.log('statusstatusstatusstatus', status);
  //Check account balance
  dialog.message = 'Retrieving account information...';
  const accountInfo = await algodClient.accountInformation(account).do();
  console.log('accountInfo', accountInfo);

  const startingAmount = accountInfo.amount;
  console.log('User account balance: microAlgos', startingAmount);

  // Construct the transaction
  const params = await algodClient.getTransactionParams().do();
  console.log('params', params);
  // comment out the next two lines to use suggested fee
  // params.fee = 1000;
  // params.flatFee = false;
  // const closeout = receiver; //closeRemainderTo
  // WARNING! all remaining funds in the sender account above will be sent to the closeRemainderTo Account
  // In order to keep all remaining funds in the sender account after tx, set closeout parameter to undefined.
  // For more info see:
  // https://developer.algorand.org/docs/reference/transactions/#payment-transaction
  // Asset creation specific parameters
  // The following parameters are asset specific
  // Throughout the example these will be re-used.

  const defaultFrozen = false;
  // Friendly name of the asset
  const assetName = metadat.title;
  // Optional string pointing to a URL relating to the asset
  const url = metadat.url;
  // const managerAddr = 'ILHMK67WCDOW3RHYZWTYPOVSXJOIETARELRLATUSVXV2TTTYIN47X4GE3E'; // OPTIONAL: FOR DEMO ONLY, USED TO DESTROY ASSET WITHIN
  const managerAddr = account;
  const reserveAddr = account;
  const freezeAddr = account;
  const clawbackAddr = account;

  // Use actual total  > 1 to create a Fungible Token
  // example 1:(fungible Tokens)
  // totalIssuance = 10, decimals = 0, result is 10 total actual
  // example 2: (fractional NFT, each is 0.1)
  // totalIssuance = 10, decimals = 1, result is 1.0 total actual
  // example 3: (NFT)
  // totalIssuance = 1, decimals = 0, result is 1 total actual
  // integer number of decimals for asset unit calculation
  const decimals = 0;
  const total = 1; // how many of this asset there will be

  const metadataHash = mdhash.digest(metadat);
  console.log('metadataHash', metadataHash);

  dialog.message = 'Sending NFT data...';
  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    from: account,
    total: total,
    decimals: decimals,
    assetName: assetName,
    assetURL: url,
    assetMetadataHash: metadataHash,
    note: algosdk.encodeObj(metadat),
    defaultFrozen,
    freeze: freezeAddr,
    manager: managerAddr,
    clawback: clawbackAddr,
    reserve: reserveAddr,
    suggestedParams: params,
  });
  console.log('txn', txn);

  // const rawSignedTxn = txn.signTxn(recoveredAccount2.sk);
  // const rawSignedTxn = await wallet.signTxn([txn]);
  // const ctx = await algodClient.sendRawTransaction(rawSignedTxn).do();
  // // Wait for confirmation
  // const confirmedTxn = await algosdk.waitForConfirmation(algodClient, ctx.txId, 4);
  // //Get the completed Transaction
  // console.log('Transaction ' + ctx.txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);

  const [s_create_txn] = await wallet.signTxn([txn]);
  console.log('[s_create_txn]', [s_create_txn]);

  dialog.message = 'Sending NFT data...';
  const { txId } = await algodClient
    .sendRawTransaction(
      [s_create_txn].map((t) => {
        return t.blob;
      })
    )
    .do();

  dialog.message = 'Waiting for confirmation...';
  const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 10);
  console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);
  const assetID = confirmedTxn['asset-index'];
  console.log('AssetID = ' + assetID);

  await printCreatedAsset(algodClient, account, assetID);
  await printAssetHolding(algodClient, account, assetID);

  const assetInfo: AssetInfo = {
    transactionId: txId,
    assetID: assetID,
  };

  return assetInfo;
}

export async function destroyAsset(algodClient: any, account: any, assetID: any, wallet: any) {
  console.log('account', account);
  console.log('algodClient', algodClient);
  console.log('assetID', assetID);
  console.log('assetID', typeof assetID);
  console.log('==> DESTROY ASSET');
  const assetNumber = Number(assetID);
  // All of the created assets should now be back in the creators
  // Account so we can delete the asset.
  // If this is not the case the asset deletion will fail
  const params = await algodClient.getTransactionParams().do();
  const addr = account;
  const txn = algosdk.makeAssetDestroyTxnWithSuggestedParamsFromObject({
    from: addr,
    note: undefined,
    assetIndex: assetNumber,
    suggestedParams: params,
  });
  console.log('txn', txn);

  dialog.subtitle = 'Waiting for user confirmation';
  dialog.highlight = true;
  const [s_create_txn] = await wallet.signTxn([txn]);
  console.log('[s_create_txn]', [s_create_txn]);

  dialog.subtitle = '';
  dialog.highlight = false;
  const { txId } = await algodClient
    .sendRawTransaction(
      [s_create_txn].map((t) => {
        return t.blob;
      })
    )
    .do();
  const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 10);
  console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);
  // The account3 and account1 should no longer contain the asset as it has been destroyed
  console.log('Asset ID: ' + assetID);
  console.log('AccountAddr = ' + account);
  await printCreatedAsset(algodClient, account, assetID);
  await printAssetHolding(algodClient, account, assetID);

  // return;
}

// Function used to print created asset for account and assetid
const printCreatedAsset = async function (algodClient: any, account: any, assetid: any) {
  // note: if you have an indexer instance available it is easier to just use this
  //     const accountInfo = await indexerClient.searchAccounts()
  //    .assetID(assetIndex).do();
  // and in the loop below use this to extract the asset for a particular account
  // accountInfo['accounts'][idx][account]);
  const accountInfo = await algodClient.accountInformation(account).do();
  for (let idx = 0; idx < accountInfo['created-assets'].length; idx++) {
    const scrutinizedAsset = accountInfo['created-assets'][idx];
    if (scrutinizedAsset['index'] == assetid) {
      console.log('AssetID = ' + scrutinizedAsset['index']);
      const myparms = JSON.stringify(scrutinizedAsset['params'], undefined, 2);
      console.log('parms = ' + myparms);
      break;
    }
  }
};
// Function used to print asset holding for account and assetid
const printAssetHolding = async function (algodClient: any, account: any, assetid: any) {
  // note: if you have an indexer instance available it is easier to just use this
  //     const accountInfo = await indexerClient.searchAccounts()
  //    .assetID(assetIndex).do();
  // and in the loop below use this to extract the asset for a particular account
  // accountInfo['accounts'][idx][account]);
  const accountInfo = await algodClient.accountInformation(account).do();
  for (let idx = 0; idx < accountInfo['assets'].length; idx++) {
    const scrutinizedAsset = accountInfo['assets'][idx];
    if (scrutinizedAsset['asset-id'] == assetid) {
      const myassetholding = JSON.stringify(scrutinizedAsset, undefined, 2);
      console.log('assetholdinginfo = ' + myassetholding);
      break;
    }
  }
};

/**
 * Starts the creation of an asset.
 */
export async function createNFT(
  algodClient: algosdk.Algodv2,
  account: string,
  metadat: metadataNFTType,
  wallet: Wallet
): Promise<option<AssetInfo>> {
  try {
    const info = await createAsset(algodClient, account, metadat, wallet);
    return some(info);
  } catch (err) {
    console.log('Failed to process NFT creation!', err);
    return none();
  }
}