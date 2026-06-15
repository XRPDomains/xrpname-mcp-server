/**
 * XRPL NFToken transaction builders — §9. BUILD-TX-NOT-SIGN: these produce
 * UNSIGNED transactions only. The user signs in their own wallet; the server
 * never holds a key.
 *
 * Each builder returns:
 *   - tx_json       : standard XRPL PascalCase (protocol-correct; what any
 *                     XRPL signer / the hex blob is derived from)
 *   - walletPayload : Gem-wallet camelCase variant (best-effort mirror of
 *                     v3 `V3NftTx`; TODO(verify-v3): the v3 web app is out of
 *                     this repo's scope, so confirm exact Gem field names there)
 *   - method_hint   : the wallet method the payload maps to
 *
 * Fees: fixed 12 drops (§9.3, mirrors V3.Const.xrpl.feeDrops).
 */

export const FEE_DROPS = '12';

/** tfSellNFToken — marks an NFTokenCreateOffer as a sell offer. */
export const TF_SELL_NFTOKEN = 1;

export interface BuiltTx {
  tx_json: Record<string, unknown>;
  walletPayload: Record<string, unknown>;
  method_hint: string;
}

/**
 * NFTokenCreateOffer sell offer (Amount 0, directed Destination) — the transfer
 * primitive. The recipient completes it with an NFTokenAcceptOffer.
 */
export function buildTransferOffer(params: {
  owner: string;
  nftokenId: string;
  destination: string;
}): BuiltTx {
  const tx_json = {
    TransactionType: 'NFTokenCreateOffer',
    Account: params.owner,
    NFTokenID: params.nftokenId,
    Amount: '0',
    Destination: params.destination,
    Flags: TF_SELL_NFTOKEN,
    Fee: FEE_DROPS,
  };
  return {
    tx_json,
    walletPayload: {
      transactionType: 'NFTokenCreateOffer',
      account: params.owner,
      nftokenID: params.nftokenId,
      amount: '0',
      destination: params.destination,
      flags: TF_SELL_NFTOKEN,
      fee: FEE_DROPS,
    },
    method_hint: 'createNFTOffer',
  };
}

/** NFTokenAcceptOffer — accept an incoming sell offer (offer directed at you). */
export function buildAcceptOffer(params: { account: string; offerId: string }): BuiltTx {
  const tx_json = {
    TransactionType: 'NFTokenAcceptOffer',
    Account: params.account,
    NFTokenSellOffer: params.offerId,
    Fee: FEE_DROPS,
  };
  return {
    tx_json,
    walletPayload: {
      transactionType: 'NFTokenAcceptOffer',
      account: params.account,
      nftokenSellOffer: params.offerId,
      fee: FEE_DROPS,
    },
    method_hint: 'acceptNFTOffer',
  };
}

/** NFTokenCancelOffer — cancel one or more of your own outstanding offers. */
export function buildCancelOffer(params: { account: string; offerIds: string[] }): BuiltTx {
  const tx_json = {
    TransactionType: 'NFTokenCancelOffer',
    Account: params.account,
    NFTokenOffers: params.offerIds,
    Fee: FEE_DROPS,
  };
  return {
    tx_json,
    walletPayload: {
      transactionType: 'NFTokenCancelOffer',
      account: params.account,
      nftokenOffers: params.offerIds,
      fee: FEE_DROPS,
    },
    method_hint: 'cancelNFTOffer',
  };
}

/** NFTokenBurn — permanently destroys the domain NFT. Irreversible. */
export function buildBurn(params: { owner: string; nftokenId: string }): BuiltTx {
  const tx_json = {
    TransactionType: 'NFTokenBurn',
    Account: params.owner,
    NFTokenID: params.nftokenId,
    Fee: FEE_DROPS,
  };
  return {
    tx_json,
    walletPayload: {
      transactionType: 'NFTokenBurn',
      account: params.owner,
      nftokenID: params.nftokenId,
      fee: FEE_DROPS,
    },
    method_hint: 'burnNFT',
  };
}
