const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SigilArcanaOnChainRenderer", function () {
  it("returns base64 JSON with base64 SVG image", async () => {
    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    const renderer = await Renderer.deploy();

    const uri = await renderer.tokenURI(123, 456);
    expect(uri.startsWith("data:application/json;base64,")).to.be.true;

    const json = Buffer.from(uri.split(",")[1], "base64").toString("utf8");
    const data = JSON.parse(json);
    expect(data).to.have.property("name");
    expect(data).to.have.property("image");
    expect(data.image.startsWith("data:image/svg+xml;base64,")).to.be.true;
  });
});