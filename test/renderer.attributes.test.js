const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Renderer – attributes", function () {
  it("includes Arcana attribute and image svg", async () => {
    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    const renderer = await Renderer.deploy();

    const tokenId = 42;
    const arcana = 9876;
    const uri = await renderer.tokenURI(tokenId, arcana);
    const json = Buffer.from(uri.split(",")[1], "base64").toString("utf8");
    const data = JSON.parse(json);
    expect(data.attributes[0].trait_type).to.equal("Arcana");
    expect(String(data.attributes[0].value)).to.equal(String(arcana));
    expect(data.image.startsWith("data:image/svg+xml;base64,")).to.be.true;
  });
});

