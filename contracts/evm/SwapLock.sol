// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Nomos swap lock: the EVM side of a cross-chain atomic swap (USDC on Base).
// The same sha256 secret hash locks the Bitcoin Cash side
// (contracts/SwapLock.cash). Claiming here publishes the secret in the
// Claimed event, which then unlocks the other side.

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract SwapLock {
    struct Lock {
        address token;
        address sender;
        address recipient;
        uint256 amount;
        uint64 refundAfter;
        bool done;
    }

    mapping(bytes32 => Lock) public locks;

    event Locked(bytes32 indexed secretHash, address indexed token, address sender, address indexed recipient, uint256 amount, uint64 refundAfter);
    event Claimed(bytes32 indexed secretHash, bytes32 secret);
    event Refunded(bytes32 indexed secretHash);

    /// Lock `amount` of `token` for `recipient` until `refundAfter` (unix time).
    function lock(bytes32 secretHash, address token, address recipient, uint256 amount, uint64 refundAfter) external {
        require(locks[secretHash].sender == address(0), "hash already used");
        require(amount > 0, "amount is zero");
        require(refundAfter > block.timestamp, "refund time has passed");
        locks[secretHash] = Lock(token, msg.sender, recipient, amount, refundAfter, false);
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transfer failed");
        emit Locked(secretHash, token, msg.sender, recipient, amount, refundAfter);
    }

    /// Anyone may submit the secret; the tokens always go to the recipient.
    function claim(bytes32 secret) external {
        bytes32 secretHash = sha256(abi.encodePacked(secret));
        Lock storage l = locks[secretHash];
        require(l.sender != address(0) && !l.done, "no open lock");
        require(block.timestamp < l.refundAfter, "lock expired");
        l.done = true;
        require(IERC20(l.token).transfer(l.recipient, l.amount), "transfer failed");
        emit Claimed(secretHash, secret);
    }

    /// After the refund time, return the tokens to the sender.
    function refund(bytes32 secretHash) external {
        Lock storage l = locks[secretHash];
        require(l.sender != address(0) && !l.done, "no open lock");
        require(block.timestamp >= l.refundAfter, "too early");
        l.done = true;
        require(IERC20(l.token).transfer(l.sender, l.amount), "transfer failed");
        emit Refunded(secretHash);
    }
}
