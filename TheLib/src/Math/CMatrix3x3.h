#pragma once

#pragma managed(push, off)

// Matrix3x3.hpp
#pragma once
#include "CTypes.h"

class CMatrix3x3 {
public:

    static std::optional<Vec3> TrySolve(const Mat3& A, const Vec3& B) noexcept {
        auto det = Determinant(A);
        if (std::fabs(det) < 1e-10)
            return std::nullopt; // singular or nearly singular

        Vec3 X{};
        for (int i = 0; i < 3; ++i) {
            Mat3 Ai = A;
            for (int j = 0; j < 3; ++j)
                Ai[j][i] = B[j];
            X[i] = Determinant(Ai) / det;
        }
        return X;
    }

private:
    static double Determinant(const Mat3& M) noexcept {
        return
            M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
            M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
            M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    }
};

#pragma managed(pop)