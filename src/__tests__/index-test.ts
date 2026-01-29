import { TurnkeySigner, getAddressFromPublicKey } from "../index";

describe("@turnkey/stacks", () => {
  describe("getAddressFromPublicKey", () => {
    it("should derive testnet address from compressed public key", () => {
      const publicKey =
        "025afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb";
      const address = getAddressFromPublicKey(publicKey, "testnet");

      expect(address).toMatch(/^ST/);
    });

    it("should derive mainnet address from compressed public key", () => {
      const publicKey =
        "025afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb";
      const address = getAddressFromPublicKey(publicKey, "mainnet");

      expect(address).toMatch(/^SP/);
    });

    it("should throw for invalid public key length", () => {
      expect(() => getAddressFromPublicKey("025afa")).toThrow(
        /Invalid public key length/
      );
    });

    it("should throw for invalid public key prefix", () => {
      const invalidPrefix =
        "045afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb";
      expect(() => getAddressFromPublicKey(invalidPrefix)).toThrow(
        /Invalid public key prefix/
      );
    });
  });

  describe("TurnkeySigner", () => {
    const mockClient = {
      signRawPayload: jest.fn(),
    };

    it("should create signer with valid config", () => {
      const signer = new TurnkeySigner({
        client: mockClient,
        organizationId: "org-123",
        publicKey:
          "025afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb",
        network: "testnet",
      });

      expect(signer.organizationId).toBe("org-123");
      expect(signer.network).toBe("testnet");
    });

    it("should default to testnet network", () => {
      const signer = new TurnkeySigner({
        client: mockClient,
        organizationId: "org-123",
        publicKey:
          "025afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb",
      });

      expect(signer.network).toBe("testnet");
    });

    it("should return correct address for network", () => {
      const signer = new TurnkeySigner({
        client: mockClient,
        organizationId: "org-123",
        publicKey:
          "025afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb",
        network: "testnet",
      });

      expect(signer.getAddress()).toMatch(/^ST/);
      expect(signer.getAddress("mainnet")).toMatch(/^SP/);
    });

    it("should throw for invalid public key", () => {
      expect(
        () =>
          new TurnkeySigner({
            client: mockClient,
            organizationId: "org-123",
            publicKey: "invalid",
          })
      ).toThrow(/Invalid public key/);
    });
  });
});
