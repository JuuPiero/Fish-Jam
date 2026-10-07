// The fixed top of the gameplay background (sky, hut, pier, waterline): the same picture as the body, with two
// horizontal bands of water set moving - the open sea beyond the pier and the waterline under it. Everything is
// a sum of sines in the picture's own v, so the bands follow the rows of the art and nothing outside them
// (the hut, the planks, the sky) is displaced. No texture beyond the picture and no grab pass.
// The bottom edge fades to transparent so the body can slide up underneath it without a seam.
// _TimeOffset is added to the clock so an Editor eval can render a chosen moment.
Shader "FishJam/UI/BackgroundTop"
{
    Properties
    {
        [PerRendererData] _MainTex ("Picture", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _SeaBand ("Open sea band (v low, v high)", Vector) = (0.76, 0.82, 0, 0)
        _LineBand ("Waterline band (v low, v high)", Vector) = (0.70, 0.73, 0, 0)
        _SeaAmp ("Sea wobble (uv x)", Float) = 0.0016
        _LineAmp ("Waterline wobble (uv x)", Float) = 0.0012
        _Speed ("Speed", Float) = 1
        _Glint ("Glint strength", Float) = 0.35
        _FadeEdges ("Bottom fade (v transparent, v opaque)", Vector) = (0.645, 0.695, 0, 0)
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
        Blend SrcAlpha OneMinusSrcAlpha

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
            float4 _SeaBand;
            float4 _LineBand;
            float _SeaAmp;
            float _LineAmp;
            float _Speed;
            float _Glint;
            float4 _FadeEdges;
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

            // 0 outside the band, 1 inside, with a soft edge a quarter of the band wide so a wave never starts on a line.
            float BandMask(float v, float2 band)
            {
                float soft = (band.y - band.x) * 0.25;
                return smoothstep(band.x, band.x + soft, v) * (1.0 - smoothstep(band.y - soft, band.y, v));
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float t = (_Time.y + _TimeOffset) * _Speed;
                float v = i.uv.y;

                float sea = BandMask(v, _SeaBand.xy);
                float line_ = BandMask(v, _LineBand.xy);

                // Streaks that slide sideways at different rates read as swell without any texture.
                float dx = sea * _SeaAmp * (sin(v * 220.0 + t * 1.3) + 0.5 * sin(v * 97.0 - t * 0.8))
                         + line_ * _LineAmp * (sin(v * 600.0 + t * 2.4) + 0.5 * sin(v * 310.0 - t * 1.7));
                float dy = line_ * _LineAmp * 0.5 * sin(i.uv.x * 90.0 + t * 1.9);

                // Only water may move: the bands span the whole width, so they also cross the hut's porch, the planks and
                // the pier legs, and those must stay still. Water is the blue-dominant part of the picture.
                fixed4 still = tex2D(_MainTex, i.uv);
                fixed4 moved = tex2D(_MainTex, i.uv + float2(dx, dy));
                float water = saturate((still.b - still.r - 0.12) * 5.0);
                fixed4 col = lerp(still, moved, water);

                // Sparse glints: the product of two slow sine fields is positive in scattered patches; a high power thins
                // them to sparkles.
                // Low frequency in v: the bands are only a few percent of the picture tall, and a fast sine there reads as rain.
                float g = sin(i.uv.x * 90.0 + t * 1.1 + sin(v * 60.0) * 2.0) * sin(i.uv.x * 37.0 - t * 0.7 + v * 230.0);
                g = pow(saturate(g), 6.0);
                col.rgb += g * (sea * 0.6 + line_) * water * _Glint * fixed3(1.0, 1.0, 0.9);

                col *= i.color;
                col.a *= smoothstep(_FadeEdges.x, _FadeEdges.y, v);
                return col;
            }
            ENDCG
        }
    }
}
