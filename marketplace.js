const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect, assert } = require("chai");
const { ethers } = require("hardhat");

// util functon
const deployBlockMarketPlace = async () => {
  // target the BlockMarketPlace contract within our contract folder
  const [owner_, addr1, addr2, addr3, addr4] = await ethers.getSigners();
  const BlockMarketPlaceContract = await ethers.getContractFactory(
    "BlockMarketPlace"
  ); // target BlockMarketPlace.sol
  const BlockNftContract = await ethers.getContractFactory("BlockNft");
  const BlockTokenContract = await ethers.getContractFactory("BlockToken");
  let name_ = "BlockToken";
  let symbol_ = "BCT";
  const BlockToken = await BlockTokenContract.deploy(
    name_,
    symbol_,
    owner_.address
  ); // deploy the BlockToken contract
  const blocknft = await BlockNftContract.deploy();
  const marketplace = await BlockMarketPlaceContract.connect(owner_).deploy();
  // deploy the BlockMarketPlace contract
  return {
    marketplace,
    blocknft,
    BlockToken,
    owner_,
    addr1,
    addr2,
    addr3,
    addr4,
  }; // return the deployed instance of our BlockMarketPlace contract
};

// Test suite for the BlockMarketPlace smart contract
describe("BlockMarketPlace Test Suite", () => {
  // Section 1: Testing contract deployment
  describe("Deployment", () => {
    // Test case: Check if the contract sets the correct owner when deployed
    it("Should return set values upon deployment", async () => {
      // Deploy the marketplace contract and get its details (marketplace and owner address)
      const { marketplace, owner_ } = await loadFixture(deployBlockMarketPlace);
      // Check if the contract's marketOwner is the expected owner address
      expect(await marketplace.marketOwner()).to.eq(owner_);
      // Why? Ensures the marketplace knows who created it, important for managing the contract
    });
  });

  // Section 2: Testing NFT listing functionality
  describe("Listing", () => {
    // Test case: Check if an NFT can be listed correctly
    it("Should list Nft accordingly", async () => {
      // Load the marketplace, user address (addr1), ERC20 token (BlockToken), and NFT contract
      const { marketplace, addr1, BlockToken, blocknft } = await loadFixture(
        deployBlockMarketPlace
      );
      // Set token ID for the NFT
      let tokenId = 1;
      // User (addr1) creates (mints) an NFT and owns it
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract (BlockToken) for payments
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User gives the marketplace permission to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      // User lists the NFT for sale with details: owner, token ID, payment token, price, etc.
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false, // Payment is in ERC20 (not ETH)
        price: 100000, // Price is 100,000 tokens
        sold: false, // NFT is not sold yet
        minOffer: 10, // Minimum offer allowed is 10 tokens
      });
      // Check if the NFT ownership transferred to the marketplace (meaning it's listed)
      expect(await blocknft.ownerOf(tokenId)).to.eq(
        await marketplace.getAddress()
      );
      // Why? Confirms the NFT is successfully listed and under marketplace control
    });

    // Test case: Check if the contract rejects invalid listing attempts
    it("Should revert upon setting unaccepted values", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, BlockToken, blocknft } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      // Try listing with invalid price (0)
      let tx1 = marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 0, // Invalid: price can't be 0
        sold: false,
        minOffer: 10,
      });
      // Check if the contract rejects it with "Invalid price"
      await expect(tx1).to.be.revertedWith("Invalid price");
      // Try listing with invalid minimum offer (0)
      let tx2 = marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 10000,
        sold: false,
        minOffer: 0, // Invalid: min offer can't be 0
      });
      // Check if the contract rejects it with "Invalid min offer"
      await expect(tx2).to.be.revertedWith("Invalid min offer");
      // Try listing with ETH but specifying ERC20 token
      let tx3 = marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: true, // Says ETH, but paymentToken is ERC20 (wrong)
        price: 10000,
        sold: false,
        minOffer: 10,
      });
      // Check if the contract rejects it with "ERC20 Payment is not supported"
      await expect(tx3).to.be.revertedWith("ERC20 Payment is not supported");
      // List with a "zero address" (indicating ETH payment)
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress, // Indicates ETH
        NftToken: blocknft.getAddress(),
        isNative: true, // Correctly set for ETH
        price: 10000,
        sold: false,
        minOffer: 10,
      });
      // Check if the listing uses the zero address (ETH) as the payment token
      let [, , paymentToken, , ,] = await marketplace.getListing(1);
      expect(await paymentToken).to.eq(ZeroAddress);
      // Why? Ensures the contract enforces rules for valid prices, offers, and payment types
    });
  });

  // Section 3: Testing NFT buying functionality
  describe("BuyNFT", () => {
    // Test case: Check if the contract prevents buying an already sold NFT
    it("Should revert if the NFT is already sold", async () => {
      // Load the marketplace, NFT contract, token, and user addresses
      const { marketplace, blocknft, BlockToken, owner_, addr1, addr2, addr3 } =
        await loadFixture(deployBlockMarketPlace);
      let tokenId = 1;
      // User (addr1) mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      // User lists the NFT for 500 tokens
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 500,
        sold: false,
        minOffer: 250,
      });
      // Owner mints 2000 tokens and sends 1000 to addr2
      await BlockToken.connect(owner_).mint(2000, owner_);
      await BlockToken.connect(owner_).transfer(addr2.address, 1000);
      // addr2 approves the marketplace to spend 1000 tokens
      await BlockToken.connect(addr2).approve(marketplace.getAddress(), 1000);
      // addr2 buys the NFT
      await marketplace.connect(addr2).buyNft(listId);
      // Check if the NFT now belongs to addr2 and is marked as sold
      expect(await blocknft.ownerOf(tokenId)).to.eq(addr2.address);
      expect((await marketplace.getListing(listId)).sold).to.equal(true);
      // addr3 tries to buy the same NFT
      await BlockToken.connect(owner_).transfer(addr3.address, 500);
      await BlockToken.connect(addr3).approve(marketplace.getAddress(), 500);
      // Check if the contract rejects the purchase with "ALready Sold"
      await expect(
        marketplace.connect(addr3).buyNft(listId)
      ).to.be.revertedWith("ALready Sold");
      // Why? Prevents double-buying an NFT that's already sold
    });

    // Test case: Check if buying with ERC20 tokens works
    it("Should buy successfully with ERC20 token", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, BlockToken, blocknft, addr2, owner_ } =
        await loadFixture(deployBlockMarketPlace);
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      // User lists the NFT for 100 tokens
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 100,
        sold: false,
        minOffer: 10,
      });
      // Owner mints 2000 tokens and sends 1000 to addr2
      await BlockToken.connect(owner_).mint(2000, owner_);
      await BlockToken.connect(owner_).transfer(addr2.address, 1000);
      // addr2 approves the marketplace to spend 1000 tokens
      await BlockToken.connect(addr2).approve(marketplace.getAddress(), 1000);
      // Check if addr2 has 1000 tokens
      expect(await BlockToken.balanceOf(addr2.address)).to.eq(1000);
      // addr2 buys the NFT
      await marketplace.connect(addr2).buyNft(listId);
      // Check if the NFT now belongs to addr2 and is marked as sold
      expect(await blocknft.ownerOf(tokenId)).to.eq(addr2.address);
      expect((await marketplace.getListing(listId)).sold).to.equal(true);
      // Why? Verifies that buying with ERC20 tokens works correctly
    });

    // Test case: Check if buying with ETH works
    it("Should buy successfully with native ETH", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000"; // Indicates ETH
      // User lists the NFT for 10 ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 buys the NFT with 10 ETH
      await marketplace.connect(addr2).buyNft(listId, { value: 10 });
      // Check if the NFT now belongs to addr2 and is marked as sold
      expect(await blocknft.ownerOf(tokenId)).to.eq(addr2.address);
      expect((await marketplace.getListing(listId)).sold).to.equal(true);
      // Why? Verifies that buying with ETH works correctly
    });

    // Test case: Check if the contract rejects a purchase with the wrong price
    it("Should revert if price is incorrect", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for 10 ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 tries to buy with only 3 ETH (wrong amount)
      await expect(
        marketplace.connect(addr2).buyNft(listId, { value: 3 })
      ).to.be.revertedWith("Incorrect price");
      // Why? Ensures buyers can't underpay for an NFT
    });
  });

  // Section 4: Testing offer-making functionality
  describe("Offers", () => {
    // Test case: Check if the contract prevents offers on sold NFTs
    it("Should revert if offer is placed for an already sold listing", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2, addr3 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for 1000 ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 1000,
        sold: false,
        minOffer: 500,
      });
      // addr2 buys the NFT
      await marketplace.connect(addr2).buyNft(listId, { value: 1000 });
      // addr3 tries to make an offer on the sold NFT
      await expect(
        marketplace.connect(addr3).offer(listId, 700)
      ).to.be.revertedWith("Already sold");
      // Why? Prevents offers on NFTs that are already sold
    });

    // Test case: Check if the contract rejects offers below the minimum
    it("Should revert if msg.value is less than MinOffer", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT with a minimum offer of 5 ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 tries to offer 4 ETH (below minimum)
      await expect(
        marketplace.connect(addr2).offer(listId, 0, { value: 4 })
      ).to.be.revertedWith("Invalid offer");
      // Why? Ensures offers meet the seller's minimum requirement
    });

    // Test case: Check if the contract rejects incorrect ETH offer settings
    it("Should revert if offerAmount is not 0 when offering with native ETH", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 tries to offer with incorrect settings (specifying ERC20 amount)
      await expect(
        marketplace.connect(addr2).offer(listId, 6, { value: 7 })
      ).to.be.revertedWith("Cannot offer erc20");
      // Why? Ensures ETH-based offers are set up correctly
    });

    // Test case: Check if ETH offer amount matches the sent value
    it("Should check that offerAmount == msg.value when offering with native ETH", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for ETH with a minimum offer of 5
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 makes an offer of 7 ETH
      await marketplace.connect(addr2).offer(listId, 0, { value: 7 });
      // Check if the offer is recorded as 7 ETH
      expect((await marketplace.getOffer(0)).offerAmount).to.eq(7);
      // Why? Verifies that the offer matches the ETH sent
    });

    // Test case: Check if offers meet the minimum requirement for ERC20 tokens
    it("Should check that offerAmount >= MinOffer", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, BlockToken, blocknft, addr2, owner_ } =
        await loadFixture(deployBlockMarketPlace);
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      // User lists the NFT for 100 tokens with a minimum offer of 10
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 100,
        sold: false,
        minOffer: 10,
      });
      // Owner mints 2000 tokens and sends 1000 to addr2
      await BlockToken.connect(owner_).mint(2000, owner_);
      await BlockToken.connect(owner_).transfer(addr2.address, 1000);
      // addr2 approves the marketplace to spend 1000 tokens
      await BlockToken.connect(addr2).approve(marketplace.getAddress(), 1000);
      // addr2 makes a valid offer of 10 tokens
      await marketplace.connect(addr2).offer(listId, 10);
      // Check if the offer is recorded as 10 tokens
      expect((await marketplace.getOffer(0)).offerAmount).to.eq(10);
      // addr2 tries to offer 5 tokens (below minimum)
      await expect(
        marketplace.connect(addr2).offer(listId, 5)
      ).to.be.revertedWith("Invalid offer");
      // Why? Ensures offers meet the minimum threshold
    });

    // Test case: Check if the contract prevents the seller from offering on their own NFT
    it("Should check that msg.sender != listing owner", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr1 (the seller) tries to make an offer on their own NFT
      await expect(
        marketplace.connect(addr1).offer(listId, 0, { value: 7 })
      ).to.be.revertedWith("Owner cannot offer");
      // Why? Prevents sellers from bidding on their own NFTs to manipulate prices
    });
  });

  // Section 5: Testing offer acceptance functionality
  describe("AcceptOffers", () => {
    // Test case: Check if the contract prevents non-owners from accepting offers
    it("Should revert if owner is not msg.sender", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 makes an offer of 7 ETH
      await marketplace.connect(addr2).offer(listId, 0, { value: 7 });
      // addr2 (not the seller) tries to accept the offer
      await expect(
        marketplace.connect(addr2).acceptOffer(0)
      ).to.be.revertedWith("Unauthorized seller");
      // addr1 (the seller) accepts the offer
      await marketplace.connect(addr1).acceptOffer(0);
      // Why? Ensures only the seller can accept offers
    });

    // Test case: Check if the contract prevents accepting offers on sold NFTs
    it("Should revert if listing is already sold", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 makes an offer of 7 ETH
      await marketplace.connect(addr2).offer(listId, 0, { value: 7 });
      // Seller accepts the offer
      await marketplace.connect(addr1).acceptOffer(0);
      // Seller tries to accept the same offer again
      await expect(
        marketplace.connect(addr1).acceptOffer(0)
      ).to.be.revertedWith("Already Sold");
      // Why? Prevents accepting offers on an already sold NFT
    });

    // Test case: Check if accepting an ERC20 offer works
    it("Should accept offer placed with ERC20 token succcesfully", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, BlockToken, blocknft, addr2, owner_ } =
        await loadFixture(deployBlockMarketPlace);
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      // User lists the NFT for 100 tokens
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 100,
        sold: false,
        minOffer: 10,
      });
      // Owner mints 2000 tokens and sends 1000 to addr2
      await BlockToken.connect(owner_).mint(2000, owner_);
      await BlockToken.connect(owner_).transfer(addr2.address, 1000);
      // addr2 approves the marketplace to spend 1000 tokens
      await BlockToken.connect(addr2).approve(marketplace.getAddress(), 1000);
      // addr2 makes an offer of 10 tokens
      await marketplace.connect(addr2).offer(listId, 10);
      // Seller accepts the offer
      await marketplace.connect(addr1).acceptOffer(0);
      // Check if the offer is marked as accepted
      expect((await marketplace.getOffer(0)).status).to.eq(true);
      // Why? Verifies that accepting ERC20 offers works correctly
    });
  });

  // Section 6: Testing offer cancellation functionality
  describe("CancelOffers", () => {
    // Test case: Check if the contract prevents canceling already accepted offers
    it("Should revert if trying to cancel already accepted offer", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, BlockToken, blocknft, addr2, owner_ } =
        await loadFixture(deployBlockMarketPlace);
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      // User lists the NFT for 100 tokens
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 100,
        sold: false,
        minOffer: 10,
      });
      // Owner mints 2000 tokens and sends 1000 to addr2
      await BlockToken.connect(owner_).mint(2000, owner_);
      await BlockToken.connect(owner_).transfer(addr2.address, 1000);
      // addr2 approves the marketplace to spend 1000 tokens
      await BlockToken.connect(addr2).approve(marketplace.getAddress(), 1000);
      // addr2 makes an offer of 10 tokens
      await marketplace.connect(addr2).offer(listId, 10);
      // Seller accepts the offer
      await marketplace.connect(addr1).acceptOffer(0);
      // addr2 tries to cancel the accepted offer
      await expect(
        marketplace.connect(addr2).cancelOffer(0)
      ).to.be.revertedWith("Offer already accepted");
      // Why? Prevents canceling offers that have already been accepted
    });

    // Test case: Check if the contract prevents non-offerers from canceling offers
    it("Should revert if not offerer trying to cancel offer", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, BlockToken, blocknft, addr2, owner_ } =
        await loadFixture(deployBlockMarketPlace);
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      // User lists the NFT for 100 tokens
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 100,
        sold: false,
        minOffer: 10,
      });
      // Owner mints 2000 tokens and sends 1000 to addr2
      await BlockToken.connect(owner_).mint(2000, owner_);
      await BlockToken.connect(owner_).transfer(addr2.address, 1000);
      // addr2 approves the marketplace to spend 1000 tokens
      await BlockToken.connect(addr2).approve(marketplace.getAddress(), 1000);
      // addr2 makes an offer of 10 tokens
      await marketplace.connect(addr2).offer(listId, 10);
      // addr1 (not the offerer) tries to cancel the offer
      await expect(
        marketplace.connect(addr1).cancelOffer(0)
      ).to.be.revertedWith("Unauthorized offerrer");
      // addr2 (the offerer) cancels the offer
      await marketplace.connect(addr2).cancelOffer(0);
      // Why? Ensures only the person who made the offer can cancel it
    });

    // Test case: Check if canceling an offer works
    it("Should cancel offer successfully", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 makes an offer of 7 ETH
      await marketplace.connect(addr2).offer(listId, 0, { value: 7 });
      // addr2 cancels the offer
      await marketplace.connect(addr2).cancelOffer(0);
      // Why? Verifies that offers can be canceled successfully
    });
  });

  // Section 7: Testing listing cancellation functionality
  describe("CancelListings", () => {
    // Test case: Check if the contract prevents unauthorized users from canceling listings
    it("Should revert if unauthorized user tries to cancel listing", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 (not the seller) tries to cancel the listing
      await expect(
        marketplace.connect(addr2).cancelListing(listId)
      ).to.be.revertedWith("Unauthorized user");
      // Why? Ensures only the seller can cancel their listing
    });

    // Test case: Check if the contract prevents canceling sold listings
    it("Should revert if lister tries to cancel sold listing", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, blocknft, addr2 } = await loadFixture(
        deployBlockMarketPlace
      );
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      let ZeroAddress = "0x0000000000000000000000000000000000000000";
      // User lists the NFT for ETH
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: ZeroAddress,
        NftToken: blocknft.getAddress(),
        isNative: true,
        price: 10,
        sold: false,
        minOffer: 5,
      });
      // addr2 buys the NFT
      await marketplace.connect(addr2).buyNft(listId, { value: 10 });
      // Seller tries to cancel the sold listing
      await expect(
        marketplace.connect(addr1).cancelListing(listId)
      ).to.be.revertedWith("Already sold");
      // Why? Prevents canceling listings that have already been sold
    });

    // Test case: Check if canceling a listing works
    it("Should successfully cancel listing", async () => {
      // Load the marketplace and related contracts/users
      const { marketplace, addr1, BlockToken, blocknft, addr2, owner_ } =
        await loadFixture(deployBlockMarketPlace);
      let tokenId = 1;
      // User mints an NFT
      await blocknft.connect(addr1).mint(addr1);
      // Get the ERC20 token contract
      let token = await ethers.getContractAt("IERC20", BlockToken);
      // User approves the marketplace to manage their NFT
      await blocknft
        .connect(addr1)
        .setApprovalForAll(marketplace.getAddress(), true);
      let listId = 0;
      // User lists the NFT for 100 tokens
      await marketplace.connect(addr1).listNft({
        owner: addr1,
        tokenId: tokenId,
        paymentToken: token,
        NftToken: blocknft.getAddress(),
        isNative: false,
        price: 100,
        sold: false,
        minOffer: 10,
      });
      // Seller cancels the listing
      await marketplace.connect(addr1).cancelListing(listId);
      // Check if the NFT ownership returns to the seller
      expect(await blocknft.ownerOf(tokenId)).to.eq(addr1.address);
      // Why? Verifies that canceling a listing returns the NFT to the seller
    });
  });
});
