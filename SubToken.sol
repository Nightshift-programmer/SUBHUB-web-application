// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SubToken - Subscription Payment Token
 * @notice ERC20 token used exclusively for SubHub subscription payments
 * @dev Simple, non-upgradeable ERC20 token with initial mint
 * 
 * Purpose: Acts as the payment currency for creator subscriptions
 * Users buy SUB tokens → Pay creators → Get content access
 */
contract SubToken is ERC20, Ownable {
    
    /// @notice Initial supply minted to deployer (1 million tokens)
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10**18;
    
    // =========================================================================
    // NEW FEATURE: Token Burn Events
    // =========================================================================
    
    /// @notice Emitted when tokens are burned by a user
    event TokensBurned(address indexed burner, uint256 amount, uint256 timestamp);
    
    /**
     * @notice Constructor mints initial supply to deployer
     * @dev Deployer can distribute tokens to users for testing/usage
     */
    constructor() ERC20("SubHub Token", "SUB") Ownable(msg.sender) {
        // Mint initial supply to contract deployer
        _mint(msg.sender, INITIAL_SUPPLY);
    }
    
    /**
     * @notice Allow owner to mint additional tokens
     * @param to Address to receive minted tokens
     * @param amount Amount of tokens to mint (in wei, 18 decimals)
     * @dev FOR TESTING/DISTRIBUTION ONLY - In production, consider removing this
     * @dev Centralization risk: Owner can mint unlimited tokens
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than zero");
        _mint(to, amount);
    }
    
    // =========================================================================
    // NEW FEATURE: User Token Burn (Extension #3)
    // =========================================================================
    
    /**
     * @notice Allow users to burn their own tokens
     * @param amount Amount of tokens to burn (in wei, 18 decimals)
     * @dev Users can only burn their own tokens
     * @dev Burning does NOT affect subscriptions, plans, or platform fees
     * @dev This is a permanent operation - tokens cannot be recovered
     */
    function burn(uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance to burn");
        
        // Burn tokens from caller's balance
        _burn(msg.sender, amount);
        
        emit TokensBurned(msg.sender, amount, block.timestamp);
    }
    
    /**
     * @notice Get token balance of an address
     * @param account Address to check
     * @return Token balance in wei (18 decimals)
     * @dev Helper function for frontend integration
     */
    function getBalance(address account) external view returns (uint256) {
        return balanceOf(account);
    }
}

/**
 * HOW TO USE THIS TOKEN:
 * 
 * 1. Deploy SubToken contract
 * 2. Initial supply goes to deployer
 * 3. Deployer distributes tokens to users (via transfer or mint)
 * 4. Users approve SubHub contract to spend their SUB tokens
 * 5. Users subscribe by paying SUB tokens through SubHub
 * 6. [NEW] Users can optionally burn their own tokens
 * 
 * EXAMPLE FLOW:
 * - Deployer: mint(userAddress, 1000 * 10**18) → User gets 1000 SUB
 * - User: approve(subHubAddress, 100 * 10**18) → Allows SubHub to spend 100 SUB
 * - User: subscribe(creatorAddress) → SubHub transfers SUB from user to creator
 * - [NEW] User: burn(50 * 10**18) → Permanently destroys 50 SUB from their balance
 * 
 * NOTE ON BURNING:
 * - Burning is permanent and irreversible
 * - Only the token owner can burn their own tokens
 * - Burning does NOT affect active subscriptions
 * - Useful for deflationary tokenomics or reducing supply
 * 
 * NOTE ON MINTING:
 * - The mint() function creates centralization risk
 * - For academic/demo purposes, this is acceptable
 * - In production, consider:
 *   1. Removing mint() entirely, OR
 *   2. Adding a max supply cap, OR
 *   3. Using a vesting/controlled release mechanism
 */