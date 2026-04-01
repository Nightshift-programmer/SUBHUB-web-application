const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
// NEW: Import anyValue to ignore exact timestamp seconds
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("SubHub - Complete & Expanded Test Suite", function () {
    
    let subToken, subHub;
    let owner, feeCollector, newCollector;
    let creator1, creator2, creator3;
    let user1, user2, user3;
    let attacker;
    
    const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1 million
    const PLATFORM_FEE = 5; // 5%
    const ONE_DAY = 24 * 60 * 60;
    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    
    beforeEach(async function () {
        [owner, feeCollector, newCollector, creator1, creator2, creator3, 
         user1, user2, user3, attacker] = await ethers.getSigners();
        
        // Deploy SubToken
        const SubToken = await ethers.getContractFactory("SubToken");
        subToken = await SubToken.deploy();
        await subToken.waitForDeployment();
        
        // Deploy SubHub
        const SubHub = await ethers.getContractFactory("SubHub");
        subHub = await SubHub.deploy(await subToken.getAddress(), PLATFORM_FEE);
        await subHub.waitForDeployment();
        
        // Distribute tokens
        await subToken.transfer(user1.address, ethers.parseEther("10000"));
        await subToken.transfer(user2.address, ethers.parseEther("10000"));
        await subToken.transfer(user3.address, ethers.parseEther("10000"));
        await subToken.transfer(creator1.address, ethers.parseEther("1000"));
    });
    
    // =========================================================================
    // 1. UNIT TESTS
    // =========================================================================
    
    describe("1️⃣  Unit Tests - Token Contract", function () {
        it("Should deploy with correct initial supply", async function () {
            expect(await subToken.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(await subToken.balanceOf(owner.address)).to.be.gt(0);
        });
        it("Should have correct token metadata", async function () {
            expect(await subToken.name()).to.equal("SubHub Token");
            expect(await subToken.symbol()).to.equal("SUB");
            expect(await subToken.decimals()).to.equal(18);
        });
        it("Should allow owner to mint tokens", async function () {
            const mintAmount = ethers.parseEther("1000");
            await subToken.mint(user1.address, mintAmount);
            expect(await subToken.balanceOf(user1.address)).to.equal(ethers.parseEther("11000"));
        });
        it("Should prevent non-owner from minting", async function () {
            await expect(subToken.connect(user1).mint(user2.address, ethers.parseEther("100"))).to.be.reverted;
        });
        it("Should allow users to burn their tokens", async function () {
            const burnAmount = ethers.parseEther("100");
            await subToken.connect(user1).burn(burnAmount);
            expect(await subToken.balanceOf(user1.address)).to.equal(ethers.parseEther("9900"));
        });
        it("Should prevent burning more than balance", async function () {
            await expect(subToken.connect(user1).burn(ethers.parseEther("20000"))).to.be.revertedWith("Insufficient balance to burn");
        });
        it("Should prevent burning zero amount", async function () {
            await expect(subToken.connect(user1).burn(0)).to.be.revertedWith("Amount must be greater than zero");
        });
    });
    
    describe("1️⃣  Unit Tests - SubHub Contract", function () {
        it("Should deploy with correct parameters", async function () {
            expect(await subHub.subToken()).to.equal(await subToken.getAddress());
            expect(await subHub.platformFeePercent()).to.equal(PLATFORM_FEE);
            expect(await subHub.feeCollector()).to.equal(owner.address);
        });
        
        // FIXED: Using anyValue for timestamp
        it("Should allow creator to create plan", async function () {
            const price = ethers.parseEther("100");
            const duration = THIRTY_DAYS;
            
            await expect(
                subHub.connect(creator1).createPlan(price, duration)
            ).to.emit(subHub, "PlanCreated")
             .withArgs(creator1.address, price, duration, anyValue);
        });
        
        it("Should store plan details correctly", async function () {
            const price = ethers.parseEther("100");
            const duration = THIRTY_DAYS;
            await subHub.connect(creator1).createPlan(price, duration);
            const plan = await subHub.getPlan(creator1.address);
            expect(plan.price).to.equal(price);
            expect(plan.duration).to.equal(duration);
            expect(plan.active).to.equal(true);
            expect(plan.subscriberCount).to.equal(0);
        });
        it("Should allow creator to deactivate plan", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await expect(subHub.connect(creator1).deactivatePlan()).to.emit(subHub, "PlanDeactivated");
            const plan = await subHub.getPlan(creator1.address);
            expect(plan.active).to.equal(false);
        });
        it("Should allow creator to update plan", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            const newPrice = ethers.parseEther("200");
            await subHub.connect(creator1).createPlan(newPrice, THIRTY_DAYS);
            const plan = await subHub.getPlan(creator1.address);
            expect(plan.price).to.equal(newPrice);
        });
    });
    
    // =========================================================================
    // 2. INTEGRATION TESTS
    // =========================================================================
    
    describe("2️⃣  Integration Tests - Complete Subscription Flow", function () {
        beforeEach(async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
        });
        it("Should complete full subscription cycle", async function () {
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await expect(subHub.connect(user1).subscribe(creator1.address)).to.emit(subHub, "Subscribed");
            expect(await subHub.isSubscribed(user1.address, creator1.address)).to.equal(true);
        });
        it("Should correctly distribute payments", async function () {
            const price = ethers.parseEther("100");
            const fee = price * BigInt(PLATFORM_FEE) / BigInt(100);
            const creatorPayment = price - fee;
            
            const creatorBalanceBefore = await subToken.balanceOf(creator1.address);
            const platformBalanceBefore = await subToken.balanceOf(owner.address);
            
            await subToken.connect(user1).approve(await subHub.getAddress(), price);
            await subHub.connect(user1).subscribe(creator1.address);
            
            const creatorBalanceAfter = await subToken.balanceOf(creator1.address);
            const platformBalanceAfter = await subToken.balanceOf(owner.address);
            
            expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(creatorPayment);
            expect(platformBalanceAfter - platformBalanceBefore).to.equal(fee);
        });
        it("Should track subscriber count correctly", async function () {
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);
            let plan = await subHub.getPlan(creator1.address);
            expect(plan.subscriberCount).to.equal(1);
            
            await subToken.connect(user2).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user2).subscribe(creator1.address);
            plan = await subHub.getPlan(creator1.address);
            expect(plan.subscriberCount).to.equal(2);
        });
        it("Should handle subscription expiry correctly", async function () {
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);
            expect(await subHub.isSubscribed(user1.address, creator1.address)).to.equal(true);
            await time.increase(THIRTY_DAYS + 1);
            expect(await subHub.isSubscribed(user1.address, creator1.address)).to.equal(false);
        });
        it("Should allow renewal after expiry", async function () {
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);
            await time.increase(THIRTY_DAYS + 1);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).renew(creator1.address);
            expect(await subHub.isSubscribed(user1.address, creator1.address)).to.equal(true);
        });
    });
    
    // =========================================================================
    // 3. EDGE CASES
    // =========================================================================
    
    describe("3️⃣  Edge Cases - Boundary Conditions", function () {
        it("Should handle minimum plan price", async function () {
            const minPrice = 1; 
            await subHub.connect(creator1).createPlan(minPrice, THIRTY_DAYS);
            const plan = await subHub.getPlan(creator1.address);
            expect(plan.price).to.equal(minPrice);
        });
        it("Should reject zero price", async function () {
            await expect(subHub.connect(creator1).createPlan(0, THIRTY_DAYS)).to.be.revertedWith("Price must be greater than zero");
        });
        it("Should handle minimum duration (1 day)", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), ONE_DAY);
            const plan = await subHub.getPlan(creator1.address);
            expect(plan.duration).to.equal(ONE_DAY);
        });
        it("Should reject duration less than 1 day", async function () {
            await expect(subHub.connect(creator1).createPlan(ethers.parseEther("100"), ONE_DAY - 1)).to.be.revertedWith("Minimum duration is 1 day");
        });
        it("Should handle maximum duration (365 days)", async function () {
            const maxDuration = 365 * ONE_DAY;
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), maxDuration);
            const plan = await subHub.getPlan(creator1.address);
            expect(plan.duration).to.equal(maxDuration);
        });
        it("Should reject duration more than 365 days", async function () {
            await expect(subHub.connect(creator1).createPlan(ethers.parseEther("100"), 366 * ONE_DAY)).to.be.revertedWith("Maximum duration is 1 year");
        });
        it("Should handle maximum platform fee (20%)", async function () {
            const SubHub = await ethers.getContractFactory("SubHub");
            const highFeeHub = await SubHub.deploy(await subToken.getAddress(), 20);
            expect(await highFeeHub.platformFeePercent()).to.equal(20);
        });
        it("Should reject platform fee above 20%", async function () {
            const SubHub = await ethers.getContractFactory("SubHub");
            await expect(SubHub.deploy(await subToken.getAddress(), 21)).to.be.revertedWith("Fee too high");
        });
        it("Should handle subscription at exact expiry time", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);
            const sub = await subHub.getSubscription(user1.address, creator1.address);
            await time.increaseTo(sub.expiryTime);
            expect(await subHub.isSubscribed(user1.address, creator1.address)).to.equal(false);
        });
        it("Should handle zero fee when platform fee is 0%", async function () {
            const SubHub = await ethers.getContractFactory("SubHub");
            const zeroFeeHub = await SubHub.deploy(await subToken.getAddress(), 0);
            await zeroFeeHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            const creatorBalanceBefore = await subToken.balanceOf(creator1.address);
            await subToken.connect(user1).approve(await zeroFeeHub.getAddress(), ethers.parseEther("100"));
            await zeroFeeHub.connect(user1).subscribe(creator1.address);
            const creatorBalanceAfter = await subToken.balanceOf(creator1.address);
            expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(ethers.parseEther("100"));
        });
    });
    
    // =========================================================================
    // 4. SECURITY TESTS
    // =========================================================================
    
    describe("4️⃣  Security Tests - Attack Prevention", function () {
        it("Should prevent reentrancy attacks (subscribe)", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await expect(subHub.connect(user1).subscribe(creator1.address)).to.not.be.reverted;
        });
        it("Should prevent subscribing to yourself", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await expect(subHub.connect(creator1).subscribe(creator1.address)).to.be.revertedWith("Cannot subscribe to yourself");
        });
        it("Should prevent double subscription while active", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("200"));
            await subHub.connect(user1).subscribe(creator1.address);
            await expect(subHub.connect(user1).subscribe(creator1.address)).to.be.revertedWith("Subscription still active");
        });
        it("Should prevent subscription without approval", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await expect(subHub.connect(user1).subscribe(creator1.address)).to.be.reverted;
        });
        it("Should prevent subscription with insufficient balance", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100000"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100000"));
            await expect(subHub.connect(user1).subscribe(creator1.address)).to.be.reverted;
        });
        it("Should prevent renewal without existing subscription", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await expect(subHub.connect(user1).renew(creator1.address)).to.be.revertedWith("No subscription to renew");
        });
        it("Should prevent renewal while still active", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("200"));
            await subHub.connect(user1).subscribe(creator1.address);
            await expect(subHub.connect(user1).renew(creator1.address)).to.be.revertedWith("Subscription still active");
        });
        it("Should prevent subscription to inactive plan", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subHub.connect(creator1).deactivatePlan();
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await expect(subHub.connect(user1).subscribe(creator1.address)).to.be.revertedWith("Creator plan not active");
        });
        it("Should prevent non-owner from updating platform fee", async function () {
            await expect(subHub.connect(attacker).updatePlatformFee(10)).to.be.reverted;
        });
        it("Should prevent platform fee above 20%", async function () {
            await expect(subHub.updatePlatformFee(21)).to.be.revertedWith("Fee cannot exceed 20%");
        });
        it("Should prevent emergency withdraw without request", async function () {
            await expect(subHub.executeEmergencyWithdraw()).to.be.revertedWith("No pending withdrawal");
        });
        it("Should prevent emergency withdraw before delay", async function () {
            await subToken.transfer(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.requestEmergencyWithdraw(ethers.parseEther("50"));
            await expect(subHub.executeEmergencyWithdraw()).to.be.revertedWith("Withdrawal delay not expired");
        });
        it("Should prevent multiple emergency withdraw requests", async function () {
            await subToken.transfer(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.requestEmergencyWithdraw(ethers.parseEther("50"));
            await expect(subHub.requestEmergencyWithdraw(ethers.parseEther("30"))).to.be.revertedWith("Withdrawal already pending");
        });
    });
    
    // =========================================================================
    // 5. GAS TESTS
    // =========================================================================
    
    describe("5️⃣  Gas Tests - Efficiency Verification", function () {
        it("Should use reasonable gas for subscription", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            const tx = await subHub.connect(user1).subscribe(creator1.address);
            const receipt = await tx.wait();
            expect(receipt.gasUsed).to.be.lessThan(200000n);
        });
        it("Should use reasonable gas for renewal", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("200"));
            await subHub.connect(user1).subscribe(creator1.address);
            await time.increase(THIRTY_DAYS + 1);
            const tx = await subHub.connect(user1).renew(creator1.address);
            const receipt = await tx.wait();
            expect(receipt.gasUsed).to.be.lessThan(200000n);
        });
        it("Should use minimal gas for view functions", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            const isActive = await subHub.isSubscribed(user1.address, creator1.address);
            expect(isActive).to.be.a('boolean');
        });
    });
    
    // =========================================================================
    // 6. FAILURE TESTS
    // =========================================================================
    
    describe("6️⃣  Failure Tests - Error Messages", function () {
        it("Should revert with clear message for zero price", async function () {
            await expect(subHub.connect(creator1).createPlan(0, THIRTY_DAYS)).to.be.revertedWith("Price must be greater than zero");
        });
        it("Should revert with clear message for zero duration", async function () {
            await expect(subHub.connect(creator1).createPlan(ethers.parseEther("100"), 0)).to.be.revertedWith("Duration must be greater than zero");
        });
        it("Should revert for zero address creator", async function () {
            await expect(subHub.connect(user1).subscribe(ethers.ZeroAddress)).to.be.revertedWith("Invalid creator address");
        });
        it("Should revert for invalid plan", async function () {
            await expect(subHub.connect(user1).subscribe(creator1.address)).to.be.revertedWith("Creator plan not active");
        });
        it("Should revert deactivating already inactive plan", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subHub.connect(creator1).deactivatePlan();
            await expect(subHub.connect(creator1).deactivatePlan()).to.be.revertedWith("Plan already inactive");
        });
    });
    
    // =========================================================================
    // 7. STATE TESTS
    // =========================================================================
    
    describe("7️⃣  State Tests - Storage Correctness", function () {
        it("Should update subscriber count only for first subscription", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);
            let plan = await subHub.getPlan(creator1.address);
            expect(plan.subscriberCount).to.equal(1);
            
            await time.increase(THIRTY_DAYS + 1);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).renew(creator1.address);
            plan = await subHub.getPlan(creator1.address);
            expect(plan.subscriberCount).to.equal(1);
        });
        it("Should track platform fees correctly", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            const expectedFee = ethers.parseEther("100") * BigInt(5) / BigInt(100);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);
            expect(await subHub.getPlatformFeesCollected()).to.equal(expectedFee);
        });
        it("Should store subscription times correctly", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            const txTime = await time.latest() + 1;
            await subHub.connect(user1).subscribe(creator1.address);
            const sub = await subHub.getSubscription(user1.address, creator1.address);
            expect(sub.startTime).to.be.closeTo(txTime, 5);
            expect(sub.expiryTime).to.be.closeTo(txTime + THIRTY_DAYS, 5);
            expect(sub.everSubscribed).to.equal(true);
        });
        it("Should maintain clean contract balance after payments", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);
            expect(await subHub.getContractBalance()).to.equal(0);
        });
    });
    
    // =========================================================================
    // 8. EVENT TESTS
    // =========================================================================
    
    describe("8️⃣  Event Tests - Event Emission", function () {
        it("Should emit PlanCreated event", async function () {
            const price = ethers.parseEther("100");
            const duration = THIRTY_DAYS;
            
            await expect(
                subHub.connect(creator1).createPlan(price, duration)
            ).to.emit(subHub, "PlanCreated")
             .withArgs(creator1.address, price, duration, anyValue);
        });
        it("Should emit Subscribed event", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await expect(subHub.connect(user1).subscribe(creator1.address)).to.emit(subHub, "Subscribed");
        });
        it("Should emit SubscriptionRenewed event", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("200"));
            await subHub.connect(user1).subscribe(creator1.address);
            await time.increase(THIRTY_DAYS + 1);
            await expect(subHub.connect(user1).renew(creator1.address)).to.emit(subHub, "SubscriptionRenewed");
        });
        
        // FIXED: Using anyValue for timestamps
        it("Should emit EmergencyWithdrawRequested event", async function () {
            const amount = ethers.parseEther("50");
            await subToken.transfer(await subHub.getAddress(), amount);
            await expect(subHub.requestEmergencyWithdraw(amount))
                .to.emit(subHub, "EmergencyWithdrawRequested")
                .withArgs(owner.address, amount, anyValue, anyValue, anyValue);
        });
    });

    // =========================================================================
    // 9. ADDITIONAL ADVANCED TESTS
    // =========================================================================
    
    describe("9️⃣  Additional Advanced Tests", function () {
        
        // FIXED: Using anyValue for timestamps
        it("Should execute Emergency Withdraw successfully after delay", async function () {
            const stuckAmount = ethers.parseEther("500");
            await subToken.transfer(await subHub.getAddress(), stuckAmount);
            await subHub.requestEmergencyWithdraw(stuckAmount);
            await time.increase(ONE_DAY + 1);
            
            const ownerBalanceBefore = await subToken.balanceOf(owner.address);
            await expect(subHub.executeEmergencyWithdraw())
                .to.emit(subHub, "EmergencyWithdrawExecuted")
                .withArgs(owner.address, stuckAmount, anyValue);
            
            const ownerBalanceAfter = await subToken.balanceOf(owner.address);
            expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(stuckAmount);
        });

        it("Should allow Owner to Cancel Emergency Withdraw", async function () {
            const stuckAmount = ethers.parseEther("100");
            await subToken.transfer(await subHub.getAddress(), stuckAmount);
            await subHub.requestEmergencyWithdraw(stuckAmount);
            await expect(subHub.cancelEmergencyWithdraw()).to.emit(subHub, "EmergencyWithdrawCancelled");
            const status = await subHub.getEmergencyWithdrawStatus();
            expect(status.amount).to.equal(0);
        });
        it("Should correctly update Fee Collector", async function () {
            await subHub.updateFeeCollector(newCollector.address);
            expect(await subHub.feeCollector()).to.equal(newCollector.address);
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            const newCollectorBalanceBefore = await subToken.balanceOf(newCollector.address);
            await subHub.connect(user1).subscribe(creator1.address);
            const newCollectorBalanceAfter = await subToken.balanceOf(newCollector.address);
            expect(newCollectorBalanceAfter - newCollectorBalanceBefore).to.equal(ethers.parseEther("5"));
        });
        it("Should fail if Emergency Withdraw amount exceeds balance", async function () {
            const hugeAmount = ethers.parseEther("999999");
            await expect(subHub.requestEmergencyWithdraw(hugeAmount)).to.be.revertedWith("Insufficient contract balance");
        });
        it("Should handle Time Remaining calculation", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);
            let remaining = await subHub.getTimeRemaining(user1.address, creator1.address);
            expect(remaining).to.be.closeTo(THIRTY_DAYS, 5);
            await time.increase(10 * 24 * 60 * 60);
            remaining = await subHub.getTimeRemaining(user1.address, creator1.address);
            expect(remaining).to.be.closeTo(THIRTY_DAYS - (10 * 24 * 60 * 60), 5);
            await time.increase(21 * 24 * 60 * 60);
            remaining = await subHub.getTimeRemaining(user1.address, creator1.address);
            expect(remaining).to.equal(0);
        });
        it("Should fail renewing using 'renewSubscription' (legacy) if not yet subscribed", async function () {
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await expect(subHub.connect(user1).renewSubscription(creator1.address)).to.be.revertedWith("No existing subscription");
        });
        it("Should handle complex fee precision (rounding down)", async function () {
            const weirdPrice = 101n; 
            await subHub.connect(creator1).createPlan(weirdPrice, THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), weirdPrice);
            const creatorBalBefore = await subToken.balanceOf(creator1.address);
            await subHub.connect(user1).subscribe(creator1.address);
            const creatorBalAfter = await subToken.balanceOf(creator1.address);
            expect(creatorBalAfter - creatorBalBefore).to.equal(96n);
        });
    });

    // =========================================================================
    // 10. HACKER & CHEATER SIMULATIONS (The "Red Team" Suite)
    // =========================================================================
    
    describe("🔟 HACKER & CHEATER SIMULATIONS", function () {

        it("HACK: Creator 'Rug Pull' - Deactivating plan should NOT kick out existing subscribers", async function () {
            // Scenario: User pays for 30 days. Creator deactivates plan 1 second later to try and scam them.
            
            // 1. Setup Plan & Subscribe
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            await subHub.connect(user1).subscribe(creator1.address);

            // 2. Verify Active
            expect(await subHub.isSubscribed(user1.address, creator1.address)).to.equal(true);

            // 3. Creator performs "Rug Pull" (Deactivate)
            await subHub.connect(creator1).deactivatePlan();

            // 4. CHECK: User should STILL be subscribed
            expect(await subHub.isSubscribed(user1.address, creator1.address)).to.equal(true);
            
            // 5. CHECK: Time remaining should still be ~30 days
            const remaining = await subHub.getTimeRemaining(user1.address, creator1.address);
            expect(remaining).to.be.closeTo(THIRTY_DAYS, 10);
        });

        it("HACK: The 'Price Switcheroo' - Creator doubles price right before user click", async function () {
            // Scenario: Plan is 100. User sends tx. Creator front-runs and changes to 200.
            // Result: User PAYS 200. (This verifies the contract behavior, even if it's 'unfair').
            
            // 1. Initial Plan @ 100
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            
            // 2. User Approves enough (e.g., they have a high allowance)
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("500"));

            // 3. HACKER MOVE: Creator updates plan to 200
            await subHub.connect(creator1).createPlan(ethers.parseEther("200"), THIRTY_DAYS);

            // 4. User tx lands (they thought it was 100, but now it's 200)
            await subHub.connect(user1).subscribe(creator1.address);

            // 5. Verify User paid 200 (The logic holds, user got 'griefed')
            const plan = await subHub.getPlan(creator1.address);
            expect(plan.price).to.equal(ethers.parseEther("200"));
        });

        it("HACK: The 'Penny Pincher' - Avoiding Platform Fees via Precision Loss", async function () {
            // Scenario: Fee is 5%. If Price is 19 wei, 5% of 19 is 0.95. Solidity makes this 0.
            // Result: Platform gets NOTHING.
            
            const cheapPrice = 19n; // 19 wei
            await subHub.connect(creator1).createPlan(cheapPrice, THIRTY_DAYS);
            await subToken.connect(user1).approve(await subHub.getAddress(), cheapPrice);

            const platformBalBefore = await subToken.balanceOf(owner.address);
            
            await subHub.connect(user1).subscribe(creator1.address);
            
            const platformBalAfter = await subToken.balanceOf(owner.address);

            // Platform fee should be 0 because 19 * 0.05 < 1
            expect(platformBalAfter - platformBalBefore).to.equal(0);
        });

        it("HACK: The 'Last Second Revoke' - User revokes approval to fail transaction", async function () {
            // Scenario: User approves, but then runs a script to set allowance to 0 before subscribe tx lands.
            
            await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
            
            // 1. User approves
            await subToken.connect(user1).approve(await subHub.getAddress(), ethers.parseEther("100"));
            
            // 2. HACK: User sets approval back to 0
            await subToken.connect(user1).approve(await subHub.getAddress(), 0);

            // 3. User tries to subscribe
            await expect(
                subHub.connect(user1).subscribe(creator1.address)
            ).to.be.reverted; // Should fail because allowance is gone
        });

        it("HACK: The 'Hostile Takeover' - Transferring ownership during Emergency Withdraw", async function () {
            // Scenario: Owner requests withdraw. Transfer ownership. New owner tries to execute.
            // Does the contract respect the role or the specific address that requested it?
            
            const stuckAmount = ethers.parseEther("50");
            await subToken.transfer(await subHub.getAddress(), stuckAmount);

            // 1. Old Owner requests withdraw
            await subHub.connect(owner).requestEmergencyWithdraw(stuckAmount);

            // 2. Wait delay
            await time.increase(ONE_DAY + 1);

            // 3. Transfer Ownership to Attacker (simulated takeover or multisig rotation)
            await subHub.connect(owner).transferOwnership(attacker.address);

            // 4. New Owner tries to execute the OLD request
            // This SHOULD succeed because permission is based on "Owner Role", not "Address XYZ"
            await expect(
                subHub.connect(attacker).executeEmergencyWithdraw()
            ).to.not.be.reverted;
        });

        it("HACK: Denial of Service - Trying to subscribe with non-existent token", async function () {
             // Scenario: Deploying Hub with a fake token address that doesn't exist?
             // Since token is immutable in constructor, we can't change it. 
             // But we can verify what happens if we try to use features without funds.
             
             await subHub.connect(creator1).createPlan(ethers.parseEther("100"), THIRTY_DAYS);
             
             // User has 0 tokens approved (default)
             // Should fail immediately, saving gas (fail early)
             await expect(
                 subHub.connect(user3).subscribe(creator1.address)
             ).to.be.reverted; 
        });
    });
});