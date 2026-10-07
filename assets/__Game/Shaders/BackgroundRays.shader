// Light shafts falling from the water's surface, drawn additively over the water. The picture is shafts on pure
// black, so black adds nothing. Two samples at slightly different widths are sheared sideways with different
// phases, the shear growing away from the top (the shafts pivot at the surface), so the shafts drift against each
// other and seem to breathe; a brightness wave runs down the shafts, and a fade-in over the first rows keeps them from
// starting on a hard line.
// _VHeight is the share of the picture the quad shows (the uvRect height), so the quad's own top-to-bottom
// position can be worked out from its uv.
Shader "FishJam/UI/BackgroundRays"
{
    Properties
    {
        [PerRendererData] _MainTex ("Shafts on black", 2D) = "black" {}
        _Color ("Tint", Color) = (0.75, 0.96, 1, 1)
        _Intensity ("Intensity", Float) = 2
        _VHeight ("Share of the picture shown (uvRect height)", Float) = 0.7
        _Sway ("Sway (uv x)", Float) = 0.05
        _Speed ("Speed", Float) = 1
        _Pulse ("Pulse depth", Float) = 0.35
        _TimeOffset ("Time offset", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "Queue"="Transparent"
            "IgnoreProjector"="True"
            "RenderType"="Transparent"
            "PreviewType"="Plane"
            "CanUseSpriteAtlas"="True"
        }

        Cull Off
        Lighting Off
        ZWrite Off
        ZTest [unity_GUIZTestMode]
        Blend One One

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 2.0
            #include "UnityCG.cginc"

            struct appdata_t
            {
                float4 vertex : POSITION;
                float4 color : COLOR;
                float2 texcoord : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                fixed4 color : COLOR;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            sampler2D _MainTex;
            fixed4 _Color;
            float _Intensity;
            float _VHeight;
            float _Sway;
            float _Speed;
            float _Pulse;
            float _TimeOffset;

            v2f vert(appdata_t v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = v.texcoord;
                o.color = v.color * _Color;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float t = (_Time.y + _TimeOffset) * _Speed;

                // 0 at the quad's top edge (uv.y is 1 there), 1 at its bottom.
                float fromTop = saturate((1.0 - i.uv.y) / _VHeight);

                // Periods of 7 and 9 seconds: slower than that the sway cannot be seen as motion on a phone. The two copies
                // swing out of step, and the second also breathes in width, so the shafts slide across each other.
                float swayA = sin(t * 0.9) * _Sway * fromTop;
                float swayB = sin(t * 0.7 + 2.1) * _Sway * 1.2 * fromTop;
                float breathe = 1.08 + 0.03 * sin(t * 0.5);
                float2 uvA = float2(i.uv.x + swayA, i.uv.y);
                float2 uvB = float2((i.uv.x - 0.5) * breathe + 0.5 + swayB, i.uv.y);

                float3 rays = (tex2D(_MainTex, uvA).rgb + tex2D(_MainTex, uvB).rgb) * 0.65;

                // A brightness wave runs down the shafts and across them, so each one lights up and dims in turn.
                float pulse = 1.0 + _Pulse * sin(t * 1.3 + i.uv.x * 9.0 - fromTop * 4.0);
                float fadeIn = smoothstep(0.0, 0.06, fromTop);

                // Premultiplied by the vertex alpha so a CanvasGroup still fades it; the blend is One One.
                return fixed4(rays * i.color.rgb * (_Intensity * pulse * fadeIn * i.color.a), 1.0);
            }
            ENDCG
        }
    }
}
