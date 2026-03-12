import { NextResponse } from "next/server";
import { getAvailableModelsForAllTargets, getAvailableModelsForTarget, findTargetById } from "@/lib/checker";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get("targetId");

    if (targetId) {
      const target = findTargetById(targetId);

      if (!target) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "TARGET_NOT_FOUND",
              message: "未找到对应检测目标",
            },
          },
          { status: 404 },
        );
      }

      const result = await getAvailableModelsForTarget(target);
      return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        results: [result],
      });
    }

    const results = await getAvailableModelsForAllTargets();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务端获取模型列表时发生异常",
        },
      },
      { status: 500 },
    );
  }
}
