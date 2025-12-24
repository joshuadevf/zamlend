import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute } = hre.deployments;

  const deployedToken = await deploy("ConfidentialZama", {
    from: deployer,
    log: true,
  });

  const deployedLend = await deploy("ZamaLend", {
    from: deployer,
    log: true,
    args: [deployedToken.address],
  });

  await execute("ConfidentialZama", { from: deployer, log: true }, "setMinter", deployedLend.address);

  console.log(`ConfidentialZama contract: `, deployedToken.address);
  console.log(`ZamaLend contract: `, deployedLend.address);
};
export default func;
func.id = "deploy_zama_lend"; // id required to prevent reexecution
func.tags = ["ZamaLend"];
