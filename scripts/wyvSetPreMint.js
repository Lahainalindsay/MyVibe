/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function parseArgs(argv) {
  const args = { qty: 1n, file: undefined, image: undefined };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--qty" && argv[i + 1]) args.qty = BigInt(argv[++i]);
    else if (a === "--file" && argv[i + 1]) args.file = argv[++i];
    else if (a === "--image" && argv[i + 1]) args.image = argv[++i];
  }
  return args;
}

function buildDefaultSVG() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
    + '<rect width="512" height="512" fill="#0a0a0f"/>'
    + '<ellipse cx="256" cy="210" rx="220" ry="140" fill="#ffffff" opacity="0.06"/>'
    + '<ellipse cx="256" cy="370" rx="140" ry="28" fill="#000000" opacity="0.35"/>'
    + '<rect x="116" y="170" width="280" height="210" rx="18" fill="#151826" stroke="#242838" stroke-width="3"/>'
    + '<rect x="116" y="170" width="280" height="26" fill="#d4af37"/>'
    + '<rect x="246" y="142" width="20" height="238" fill="#d4af37"/>'
    + '<circle cx="256" cy="155" r="16" fill="#d4af37"/>'
    + '<g transform="translate(180,230) rotate(-4)">'
    + '<rect x="0" y="0" width="180" height="64" rx="10" fill="#ffffff" stroke="#ff4da6" stroke-width="3" opacity="0.95"/>'
    + '<text x="12" y="40" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#20222b">what&#39;s your vibe?</text>'
    + '</g>'
    + '</svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

async function main() {
  const args = parseArgs(process.argv);
  const vyx = process.env.VYX_ADDRESS || process.env.WYV_ADDRESS || process.env.SOUL_ADDRESS;
  if (!vyx) throw new Error("VYX_ADDRESS (or WYV_ADDRESS/SOUL_ADDRESS) not set");

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer. Check PRIVATE_KEY");

  const wyv = await hre.ethers.getContractAt("WhatsYourVibeNFT", vyx, signer);
  console.log("Network:", hre.network.name);
  console.log("From:", await signer.getAddress());
  console.log("WYV (VYX):", vyx);

  // Resolve image input
  let image = process.env.PRE_REVEAL_IMAGE || args.image;
  if (!image && args.file) {
    const p = path.resolve(process.cwd(), args.file);
    const svg = fs.readFileSync(p, "utf8");
    image = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  if (!image) image = buildDefaultSVG();

  // Set pre-reveal image
  const t1 = await wyv.setPreRevealImage(image);
  console.log("setPreRevealImage tx:", t1.hash);
  await t1.wait();
  console.log("preRevealImage length:", (await wyv.preRevealImage()).length);

  // Mint qty with ETH (no reveal)
  const qty = args.qty;
  const price = await wyv.mintPriceETH();
  const total = price * qty;
  const t2 = await wyv.mint(qty, { value: total });
  const rc2 = await t2.wait();
  console.log("mint tx:", rc2.hash);

  // Print latest token and image URL
  const me = await signer.getAddress();
  const bal = await wyv.balanceOf(me);
  const tokenId = await wyv.tokenOfOwnerByIndex(me, bal - 1n);
  const uri = await wyv.tokenURI(tokenId);
  const json = JSON.parse(Buffer.from(String(uri).split(",")[1], "base64").toString("utf8"));
  console.log("tokenId:", tokenId.toString());
  console.log("image URL:", json.image);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

