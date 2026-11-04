import type { SourceFile } from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";
import { createVirtualFileSystem } from "typescript/unstable/fs";

// TS7 parses through its native API server; virtual files keep fixtures off disk.
export async function parseSource(source: string): Promise<SourceFile> {
  const file = "/facedown-purity/source.ts";
  const config = "/facedown-purity/tsconfig.json";
  const api = new API({
    fs: createVirtualFileSystem({
      [file]: source,
      [config]: JSON.stringify({
        compilerOptions: { noLib: true, noResolve: true, types: [] },
        files: [file],
      }),
    }),
  });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [config] });
    try {
      const program = snapshot.getProject(config)?.program;
      const tree = await program?.getSourceFile(file);
      if (!tree) throw new Error("Purity parser returned no source file");
      if ((await program?.getSyntacticDiagnostics(file))?.length)
        throw new Error("Purity source contains invalid syntax");
      return tree;
    } finally {
      await snapshot.dispose();
    }
  } finally {
    await api.close();
  }
}
