import os


def main():
    with open("./l2/dai_address.txt", "r") as f:
        dai_address = f.read()

    # TODO: read l1 solidity contract address
    l1_bridge_address = 0

    print("Initializing L2 DAI bridge contract with parameters:")
    print(" L1 Bridge Address:", l1_bridge_address)
    print(" DAI Address:", dai_address)
    print()
    stream = os.popen("interact invoke l2_dai_bridge.initialize \
            %s %s %s" %
                      (dai_address, l1_bridge_address, 0))
    output = stream.read()
    print(output)
