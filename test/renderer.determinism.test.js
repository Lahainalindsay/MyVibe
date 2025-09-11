const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Renderer – determinism", function () {
  it("returns same URI for same inputs and differs for others", async () => {
    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    const r = await Renderer.deploy();

    const u1 = await r.tokenURI(1, 2);
    const u2 = await r.tokenURI(1, 2);
    const u3 = await r.tokenURI(2, 1);

    expect(u1).to.equal(u2);
    expect(u3).to.not.equal(u1);
  });
});

