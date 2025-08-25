
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SoulArcana Integration Test" ,
    function () {
     let VibeToken,SoulArcanaNFT, SigilArcanaOnChainRenderer;
     let vibe, soulArcana, renderer;
     let deployer, user1, dao, staking, fairLaunch, influencer;

        beforeEach(async function () {
            [deployer, dao, staking, fairLaunch, influencer, user1] = await
            ethers.GetSigners();

            // Deploy Vibe Token
            VibeToken = await
            ethers.getContractFactory("VibeToken");
            vibe = await vibeToken.deploy(
                dao.address,
                staking.address,
                fairLaunch.address,
                influencer.address,
                deployer.address
            );

            // Deploy Renderer
            SigilArcanaOnChainRenderer = await
         ethers.getContractFactory("SigilArcanaOnChainRenderer");
            renderer = await 
        SigilArcanaOnChainRenderer.deploy();

            // Deploy SoulArcanaNFT with renderer + vibe
            SoulArcanaNFT = await
        ethers.getContractFactory("SoulArcanaNFT")
            ;
            soulArcana = await
        SoulArcanaNFT.deploy(renderer.target, vibe.target);
            });

            it("should mint with vibe using mintWithVibe()", async function () {
                const cost = ethers.parseEther("10");  

            // Mint 10 tokens to user1
                 await
        expect(soulArcana.connect(user1).mintwithVibe(10))
            .to.emit(soulArcana, "Transfer")
            .withArgs(ethers.ZeroAddress, user1.address, 1);

            const balance = await
        soulArcana.balanceof(user1.address);
        expect(balance).to.equal(10);
            });

            it("Should return vaild tokenURI", async function () {
                await
                soulArcana.connect(user1).mintwithVibe(1);
                    const uri = await
                soulArcana.tokenURI(1);
                    expect(uri).to.be.a("string");

                expect(uri.startsWith("data:application/json;base64,")).to.be.true;
                
            });

            it("should reveert if minting zero quantity", async function () {
                await
            expect(soulArcana.connect(user1).mintwithVibe(0))
                .to.be.revertedWith("Quantity must be > 0");
            });

    
    }
)