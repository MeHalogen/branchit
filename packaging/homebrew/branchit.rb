# Homebrew formula for Branchit. Lives in a tap (MeHalogen/homebrew-tap) as
# Formula/branchit.rb; packaging/homebrew/update-formula.sh fills in the
# version and checksum from the published npm tarball.
class Branchit < Formula
  desc "Git with an undo button: a safe, keyboard-first Git TUI"
  homepage "https://github.com/MeHalogen/branchit"
  url "https://registry.npmjs.org/branchit/-/branchit-0.6.0.tgz"
  sha256 "REPLACE_WITH_SHA256_OF_THE_NPM_TARBALL"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/branchit --version")
    system "git", "init", "-q", testpath/"repo"
    cd testpath/"repo" do
      assert_match "branch=", shell_output("#{bin}/branchit status --plain")
    end
  end
end
